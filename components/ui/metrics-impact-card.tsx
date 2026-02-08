/**
 * Metrics Impact Card
 *
 * Displays user's contribution to Spot Intel and community impact
 */

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useAuth } from '@/contexts/AuthContext';
import { getMetricsImpact, MetricsImpact } from '@/services/metricsImpact';

export default function MetricsImpactCard() {
	const { user } = useAuth();
	const [impact, setImpact] = useState<MetricsImpact | null>(null);

	const text = useThemeColor({}, 'text');
	const muted = useThemeColor({}, 'muted');
	const primary = useThemeColor({}, 'primary');
	const card = useThemeColor({}, 'card');
	const border = useThemeColor({}, 'border');

	useEffect(() => {
		if (!user?.id) return;

		// Load impact on mount
		getMetricsImpact(user.id).then(setImpact);

		// Reload when component becomes visible (user navigates back)
		const interval = setInterval(() => {
			getMetricsImpact(user.id).then(setImpact);
		}, 2000); // Check every 2 seconds for updates

		return () => clearInterval(interval);
	}, [user?.id]);

	// Don't show if no metrics provided yet
	if (!impact || impact.totalMetricsProvided === 0) return null;

	return (
		<View style={[styles.card, { backgroundColor: card, borderColor: border }]}>
			<Text style={{ color: text, fontWeight: '700', fontSize: 16, marginBottom: 8 }}>
				📊 Your Impact
			</Text>
			<Text style={{ color: muted, marginBottom: 12, fontSize: 14 }}>
				Your Spot Intel has helped others discover great places to work
			</Text>
			<View style={styles.statsRow}>
				<View style={styles.stat}>
					<Text style={{ color: primary, fontSize: 28, fontWeight: '800' }}>
						{impact.totalMetricsProvided}
					</Text>
					<Text style={{ color: muted, fontSize: 12, textAlign: 'center' }}>
						Metrics shared
					</Text>
				</View>
				<View style={styles.stat}>
					<Text style={{ color: primary, fontSize: 28, fontWeight: '800' }}>
						~{impact.estimatedPeopleHelped}
					</Text>
					<Text style={{ color: muted, fontSize: 12, textAlign: 'center' }}>
						People helped
					</Text>
				</View>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	card: {
		padding: 16,
		borderRadius: 16,
		borderWidth: 1,
		marginBottom: 16,
	},
	statsRow: {
		flexDirection: 'row',
		justifyContent: 'space-around',
		gap: 24,
	},
	stat: {
		alignItems: 'center',
	},
});
