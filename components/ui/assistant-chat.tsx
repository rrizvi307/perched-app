/**
 * Assistant Chat Component
 *
 * Conversational interface for the Perched assistant
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useAuth } from '@/contexts/AuthContext';
import { IconSymbol } from './icon-symbol';
import {
  processMessage,
  getConversationHistory,
  type AssistantMessage,
} from '@/services/conversationalAssistant';
import { withAlpha } from '@/utils/colors';
import * as Haptics from 'expo-haptics';

interface AssistantChatProps {
  userLocation: { lat: number; lng: number } | null;
  onSpotSelect?: (placeId: string, name: string) => void;
  initialMessage?: string;
  compact?: boolean;
}

export function AssistantChat({
  userLocation,
  onSpotSelect,
  initialMessage,
  compact = false,
}: AssistantChatProps) {
  const router = useRouter();
  const { user } = useAuth();
  const scrollViewRef = useRef<ScrollView>(null);

  const background = useThemeColor({}, 'background');
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'muted');
  const primary = useThemeColor({}, 'primary');
  const card = useThemeColor({}, 'card');
  const border = useThemeColor({}, 'border');

  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);

  useEffect(() => {
    loadHistory();
  }, [user?.id]);

  useEffect(() => {
    if (initialMessage && messages.length === 0 && !loading) {
      handleSendMessage(initialMessage);
    }
  }, [initialMessage]);

  const loadHistory = async () => {
    if (!user?.id) return;

    try {
      setLoadingHistory(true);
      const history = await getConversationHistory(user.id);
      setMessages(history);
    } catch (error) {
      console.error('Failed to load conversation history:', error);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleSendMessage = async (messageText?: string) => {
    const textToSend = messageText || inputText.trim();
    if (!textToSend || !user?.id) return;

    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}

    setInputText('');
    setLoading(true);

    try {
      const { response, context } = await processMessage(
        user.id,
        textToSend,
        userLocation
      );

      setMessages(context.history);

      // Scroll to bottom
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    } catch (error) {
      console.error('Failed to send message:', error);
      // Add error message
      const errorMsg: AssistantMessage = {
        id: `msg_${Date.now()}_error`,
        role: 'assistant',
        content: "Sorry, I encountered an error. Please try again.",
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleSuggestionPress = async (suggestion: string) => {
    await handleSendMessage(suggestion);
  };

  const handleActionPress = async (action: any) => {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}

    if (action.action === 'checkin' && action.data) {
      if (onSpotSelect) {
        onSpotSelect(action.data.placeId, action.data.name);
      } else {
        router.push(
          `/checkin?spot=${encodeURIComponent(action.data.name)}&placeId=${encodeURIComponent(action.data.placeId)}` as any
        );
      }
    }
  };

  if (!user) return null;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={compact ? 0 : 90}
    >
      {/* Messages */}
      <ScrollView
        ref={scrollViewRef}
        style={styles.messagesContainer}
        contentContainerStyle={[
          styles.messagesContent,
          compact && styles.messagesContentCompact,
        ]}
        onContentSizeChange={() =>
          scrollViewRef.current?.scrollToEnd({ animated: true })
        }
      >
        {loadingHistory ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator color={primary} />
            <Text style={[styles.loadingText, { color: muted }]}>
              Loading conversation...
            </Text>
          </View>
        ) : messages.length === 0 ? (
          <View style={styles.emptyContainer}>
            <View style={[styles.assistantIcon, { backgroundColor: withAlpha(primary, 0.15) }]}>
              <IconSymbol name="sparkles" size={32} color={primary} />
            </View>
            <Text style={[styles.emptyTitle, { color: text }]}>
              Hi! I&apos;m your Perched assistant
            </Text>
            <Text style={[styles.emptySubtitle, { color: muted }]}>
              I can help you find great places to work and study. Just ask!
            </Text>
            <View style={styles.quickActions}>
              <QuickAction
                label="Find a cafe"
                icon="cup.and.saucer.fill"
                onPress={() => handleSuggestionPress('Find me a quiet cafe nearby')}
                textColor={text}
                borderColor={border}
              />
              <QuickAction
                label="Study spot"
                icon="book.fill"
                onPress={() => handleSuggestionPress('Recommend a place to study')}
                textColor={text}
                borderColor={border}
              />
              <QuickAction
                label="With wifi"
                icon="wifi"
                onPress={() => handleSuggestionPress('Show me cafes with good wifi')}
                textColor={text}
                borderColor={border}
              />
            </View>
          </View>
        ) : (
          messages.map((message, index) => (
            <View key={message.id} style={styles.messageContainer}>
              {message.role === 'user' ? (
                <View style={[styles.userMessage, { backgroundColor: primary }]}>
                  <Text style={styles.userMessageText}>{message.content}</Text>
                </View>
              ) : (
                <View style={styles.assistantMessageContainer}>
                  <View style={[styles.assistantAvatar, { backgroundColor: withAlpha(primary, 0.15) }]}>
                    <IconSymbol name="sparkles" size={14} color={primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={[styles.assistantMessage, { backgroundColor: card, borderColor: border }]}>
                      <Text style={[styles.assistantMessageText, { color: text }]}>
                        {message.content}
                      </Text>
                    </View>

                    {/* Actions */}
                    {message.data?.actions && message.data.actions.length > 0 && (
                      <View style={styles.actionsContainer}>
                        {message.data.actions.slice(0, 3).map((action, idx) => (
                          <Pressable
                            key={idx}
                            onPress={() => handleActionPress(action)}
                            style={[styles.actionButton, { backgroundColor: withAlpha(primary, 0.1), borderColor: primary }]}
                          >
                            <Text style={[styles.actionButtonText, { color: primary }]}>
                              {action.label}
                            </Text>
                            <IconSymbol name="arrow.right" size={10} color={primary} />
                          </Pressable>
                        ))}
                      </View>
                    )}

                    {/* Suggestions */}
                    {message.data?.suggestions &&
                      message.data.suggestions.length > 0 &&
                      index === messages.length - 1 && (
                        <View style={styles.suggestionsContainer}>
                          {message.data.suggestions.map((suggestion, idx) => (
                            <Pressable
                              key={idx}
                              onPress={() => handleSuggestionPress(suggestion)}
                              style={[styles.suggestionChip, { backgroundColor: background, borderColor: border }]}
                            >
                              <Text style={[styles.suggestionText, { color: text }]}>
                                {suggestion}
                              </Text>
                            </Pressable>
                          ))}
                        </View>
                      )}
                  </View>
                </View>
              )}
            </View>
          ))
        )}

        {loading && (
          <View style={styles.messageContainer}>
            <View style={styles.assistantMessageContainer}>
              <View style={[styles.assistantAvatar, { backgroundColor: withAlpha(primary, 0.15) }]}>
                <IconSymbol name="sparkles" size={14} color={primary} />
              </View>
              <View style={[styles.typingIndicator, { backgroundColor: card, borderColor: border }]}>
                <View style={[styles.typingDot, { backgroundColor: primary }]} />
                <View style={[styles.typingDot, { backgroundColor: primary }]} />
                <View style={[styles.typingDot, { backgroundColor: primary }]} />
              </View>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Input */}
      <View style={[styles.inputContainer, { backgroundColor: card, borderTopColor: border }]}>
        <TextInput
          style={[styles.input, { color: text, backgroundColor: background, borderColor: border }]}
          placeholder="Ask me anything..."
          placeholderTextColor={muted}
          value={inputText}
          onChangeText={setInputText}
          onSubmitEditing={() => handleSendMessage()}
          returnKeyType="send"
          multiline
          maxLength={500}
        />
        <Pressable
          onPress={() => handleSendMessage()}
          disabled={!inputText.trim() || loading}
          style={[
            styles.sendButton,
            {
              backgroundColor: inputText.trim() && !loading ? primary : withAlpha(muted, 0.3),
            },
          ]}
        >
          <IconSymbol
            name="arrow.up"
            size={18}
            color="#FFFFFF"
          />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function QuickAction({
  label,
  icon,
  onPress,
  textColor,
  borderColor,
}: {
  label: string;
  icon: string;
  onPress: () => void;
  textColor: string;
  borderColor: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.quickActionButton, { borderColor }]}
    >
      <IconSymbol name={icon as any} size={16} color={textColor} />
      <Text style={[styles.quickActionText, { color: textColor }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    padding: 16,
    paddingBottom: 24,
  },
  messagesContentCompact: {
    padding: 12,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  assistantIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  quickActions: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  quickActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
  },
  quickActionText: {
    fontSize: 13,
    fontWeight: '600',
  },
  messageContainer: {
    marginBottom: 16,
  },
  userMessage: {
    alignSelf: 'flex-end',
    maxWidth: '75%',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 18,
    borderBottomRightRadius: 4,
  },
  userMessageText: {
    color: '#FFFFFF',
    fontSize: 15,
    lineHeight: 20,
  },
  assistantMessageContainer: {
    flexDirection: 'row',
    gap: 8,
    maxWidth: '85%',
  },
  assistantAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  assistantMessage: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderBottomLeftRadius: 4,
  },
  assistantMessageText: {
    fontSize: 15,
    lineHeight: 20,
  },
  typingIndicator: {
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderBottomLeftRadius: 4,
  },
  typingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    opacity: 0.6,
  },
  actionsContainer: {
    marginTop: 8,
    gap: 6,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
  },
  actionButtonText: {
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  suggestionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  suggestionChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  suggestionText: {
    fontSize: 12,
    fontWeight: '500',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    gap: 12,
  },
  input: {
    flex: 1,
    maxHeight: 100,
    paddingHorizontal: 16,
    paddingVertical: 10,
    paddingTop: 10,
    borderRadius: 20,
    borderWidth: 1,
    fontSize: 15,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
});
