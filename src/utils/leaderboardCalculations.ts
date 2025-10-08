interface SmolData {
  Id: string;
  Address: string;
  Plays: number;
  Views?: number;
}

interface UserData {
  Username: string;
  Address: string;
}

export interface LeaderboardEntry {
  username: string;
  address: string;
  songCount: number;
  totalPlays: number;
  totalViews: number;
  totalPoints: number;
}

const POINTS_PER_SONG = 5;
const POINTS_PER_VIEW = 1;
const POINTS_PER_PLAY = 2;

export function calculateLeaderboard(
  smols: SmolData[],
  users: UserData[],
  excludeUsernames: string[] = []
): LeaderboardEntry[] {
  if (!smols || !users || smols.length === 0 || users.length === 0) {
    return [];
  }

  const songCountsByAddress: Record<string, number> = {};
  const playCountsByAddress: Record<string, number> = {};
  const viewCountsByAddress: Record<string, number> = {};

  for (const smol of smols) {
    if (smol.Address) {
      songCountsByAddress[smol.Address] = (songCountsByAddress[smol.Address] || 0) + 1;
      if (typeof smol.Plays === 'number') {
        playCountsByAddress[smol.Address] = (playCountsByAddress[smol.Address] || 0) + smol.Plays;
      }
      if (typeof smol.Views === 'number') {
        viewCountsByAddress[smol.Address] = (viewCountsByAddress[smol.Address] || 0) + smol.Views;
      }
    } else {
      console.warn('Smol object missing Address:', smol);
    }
  }

  const processedEntries: LeaderboardEntry[] = users.map((user: UserData): LeaderboardEntry => {
    const songCount = songCountsByAddress[user.Address] || 0;
    const totalPlays = playCountsByAddress[user.Address] || 0;
    const totalViews = viewCountsByAddress[user.Address] || 0;

    const totalPoints =
      songCount * POINTS_PER_SONG +
      totalViews * POINTS_PER_VIEW +
      totalPlays * POINTS_PER_PLAY;

    return {
      username: user.Username,
      address: user.Address,
      songCount,
      totalPlays,
      totalViews,
      totalPoints,
    };
  });

  // Filter out excluded usernames
  const filteredEntries = processedEntries.filter(
    (entry) => !excludeUsernames.includes(entry.username)
  );

  filteredEntries.sort((a, b) => {
    // Sort by total points first
    if (b.totalPoints !== a.totalPoints) {
      return b.totalPoints - a.totalPoints;
    }
    // Then by plays if points are equal
    if (b.totalPlays !== a.totalPlays) {
      return b.totalPlays - a.totalPlays;
    }
    // Then by views
    if (b.totalViews !== a.totalViews) {
      return b.totalViews - a.totalViews;
    }
    // Finally by song count
    return b.songCount - a.songCount;
  });

  return filteredEntries;
}
