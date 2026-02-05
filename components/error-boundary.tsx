import React, { Component, ErrorInfo, ReactNode } from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { captureException } from '@/services/sentry';
import { tokens } from '@/constants/tokens';
import { IconSymbol } from '@/components/ui/icon-symbol';

interface Props {
	children: ReactNode;
	fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface State {
	hasError: boolean;
	error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
	constructor(props: Props) {
		super(props);
		this.state = { hasError: false, error: null };
	}

	static getDerivedStateFromError(error: Error): State {
		return { hasError: true, error };
	}

	componentDidCatch(error: Error, errorInfo: ErrorInfo) {
		// Log to Sentry
		captureException(error, {
			componentStack: errorInfo.componentStack,
		});

		console.error('ErrorBoundary caught error:', error, errorInfo);
	}

	handleReset = () => {
		this.setState({ hasError: false, error: null });
	};

	render() {
		if (this.state.hasError && this.state.error) {
			if (this.props.fallback) {
				return this.props.fallback(this.state.error, this.handleReset);
			}

			return (
				<View style={styles.container}>
					<View style={styles.content}>
						<View style={styles.iconContainer}>
							<IconSymbol name="exclamationmark.triangle.fill" size={48} color="#FF6B6B" />
						</View>
						<Text style={styles.title}>Something went wrong</Text>
						<Text style={styles.message}>
							We&apos;ve been notified and are working on a fix.
						</Text>
						{__DEV__ && (
							<View style={styles.errorBox}>
								<Text style={styles.errorText}>
									{this.state.error.toString()}
								</Text>
							</View>
						)}
						<Pressable
							style={({ pressed }) => [
								styles.button,
								pressed && styles.buttonPressed,
							]}
							onPress={this.handleReset}
						>
							<Text style={styles.buttonText}>Try Again</Text>
						</Pressable>
					</View>
				</View>
			);
		}

		return this.props.children;
	}
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: '#FBFAF8',
		alignItems: 'center',
		justifyContent: 'center',
		padding: 24,
	},
	content: {
		alignItems: 'center',
		maxWidth: 400,
	},
	iconContainer: {
		marginBottom: 24,
	},
	title: {
		fontSize: tokens.type.h2.fontSize,
		fontWeight: '700',
		color: '#0E0F12',
		marginBottom: 12,
		textAlign: 'center',
	},
	message: {
		fontSize: tokens.type.body.fontSize,
		color: '#666',
		textAlign: 'center',
		marginBottom: 24,
		lineHeight: 24,
	},
	errorBox: {
		backgroundColor: '#FFE5E5',
		borderRadius: 12,
		padding: 16,
		marginBottom: 24,
		width: '100%',
	},
	errorText: {
		fontSize: 12,
		color: '#D32F2F',
		fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
	},
	button: {
		backgroundColor: tokens.color.accent,
		paddingHorizontal: 32,
		paddingVertical: 16,
		borderRadius: 12,
		minWidth: 200,
	},
	buttonPressed: {
		opacity: 0.8,
	},
	buttonText: {
		color: '#FFFFFF',
		fontSize: tokens.type.body.fontSize,
		fontWeight: '600',
		textAlign: 'center',
	},
});
