import fs from 'node:fs';
import path from 'node:path';

function read(relPath: string) {
  return fs.readFileSync(path.join(process.cwd(), relPath), 'utf8');
}

describe('campus persistence wiring', () => {
  it('persists selected campus and clears campus values on remove', () => {
    const syncSource = read('app/campus-sync.tsx');
    expect(syncSource).toContain('updateUserRemote(user.id');
    expect(syncSource).toContain('campus: selectedCampus.name');
    expect(syncSource).toContain('campusOrCity: selectedCampus.name');

    const settingsSource = read('app/campus-settings.tsx');
    expect(settingsSource).toContain('campus: detectedCampus.name');
    expect(settingsSource).toContain('campus: selectedCampus.name');
    expect(settingsSource).toContain('updateUserRemote(user.id, { campus: null, campusOrCity: null })');
  });

  it('uses persisted streakDays in campus leaderboard entries', () => {
    const campusSource = read('services/campus.ts');
    expect(campusSource).toContain('const streak = userData?.streakDays ?? 0;');
  });
});
