import { buildProfileReputationSummary } from '../profileReputation';

describe('buildProfileReputationSummary', () => {
  it('derives typed badges and trust signals from user activity', () => {
    const summary = buildProfileReputationSummary({
      user: {
        city: 'Houston',
        campus: 'Rice University',
      },
      stats: {
        streakDays: 9,
        totalCheckins: 18,
        uniqueSpots: 10,
      },
      checkins: [
        { spotName: 'Agora Coffee', tags: ['Good Coffee', 'Cozy'], createdAt: Date.now() - 1_000 },
        { spotName: 'Agora Coffee', tags: ['Good Coffee', 'Social'], createdAt: Date.now() - 2_000 },
        { spotName: 'Campesino', tags: ['Good for Work'], createdAt: Date.now() - 3_000 },
      ],
    });

    expect(summary.badges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'consistent', label: 'Consistent' }),
        expect.objectContaining({ id: 'regular', label: 'Regular' }),
        expect.objectContaining({ id: 'explorer', label: 'Explorer' }),
        expect.objectContaining({ id: 'campus_regular', label: 'Campus Regular' }),
      ]),
    );
    expect(summary.trustSignals).toEqual(
      expect.arrayContaining([
        '18 check-ins across 10 spots',
        'Usually posts from Agora Coffee',
        'Most active around Rice University',
      ]),
    );
    expect(summary.topQualities).toContain('Good Coffee');
  });
});
