export interface QuizOption {
  text: string;
  isCorrect: boolean;
}

export interface MilestoneNft {
  tokenId: number;
  name: string;
  description: string;
}

export interface QuizQuestion {
  id: number;
  text: string;
  difficulty: 'easy' | 'medium' | 'hard' | 'expert';
  timeLimit: number;
  points: number;
  options: QuizOption[];
  hint: string;
  explanation: string;
  milestoneNft: MilestoneNft | null;
}

export interface CompletionNft {
  tokenId: number;
  name: string;
  description: string;
}

export interface QuizCategory {
  category: string;
  displayName: string;
  icon: string;
  description: string;
  totalQuestions: number;
  completionNft: CompletionNft;
  isFeatured?: boolean;
  questions: QuizQuestion[];
}

export interface GameSession {
  category: string;
  displayName: string;
  questions: QuizQuestion[];       // shuffled subset
  currentIndex: number;
  score: number;
  correctCount: number;
  wrongCount: number;
  currentStreak: number;
  bestStreak: number;
  streakMultiplier: number;
  lives: number;
  startedAt: number;               // timestamp
  endedAt?: number;
  gameItemsUsed: GameItemUsage[];
  milestoneNftsEarned: MilestoneNft[];
  completionNftEarned: boolean;
}

export interface GameItemUsage {
  itemId: number;
  itemName: string;
  usedAtQuestion: number;
}

export interface LocalHighScore {
  category: string;
  score: number;
  correctCount: number;
  totalQuestions: number;
  date: string;
}

export type GamePhase = 'idle' | 'countdown' | 'playing' | 'paused' | 'answering' | 'result' | 'gameover';
