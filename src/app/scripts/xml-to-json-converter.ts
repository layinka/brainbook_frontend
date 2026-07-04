/**
 * BrainBook XML → JSON Quiz Converter
 * Run with: npx ts-node src/app/scripts/xml-to-json-converter.ts
 *
 * Reads all XML quiz files from ../quiz_content/*.xml
 * Writes enriched JSON files to ../quiz_content/*.json
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Category Metadata ───────────────────────────────────────────────────────
interface CategoryMeta {
  displayName: string;
  icon: string;
  description: string;
  completionNftTokenId: number;
  completionNftName: string;
}

const CATEGORY_META: Record<string, CategoryMeta> = {
  africa:              { displayName: 'Africa',               icon: 'africaicon-sheet0.png',      description: 'Test your knowledge of the African continent',                completionNftTokenId: 1,  completionNftName: 'Africa Scholar' },
  basicmath:           { displayName: 'Basic Math',           icon: 'basicmath-sheet0.png',       description: 'Sharpen your arithmetic skills',                              completionNftTokenId: 2,  completionNftName: 'Math Whiz' },
  bible:               { displayName: 'The Bible',            icon: 'thebible-sheet0.png',        description: 'How well do you know the Holy Scriptures?',                   completionNftTokenId: 3,  completionNftName: 'Scripture Expert' },
  cars:                { displayName: 'Cars',                 icon: 'cars-sheet0.png',            description: 'Everything about automobiles and motors',                     completionNftTokenId: 4,  completionNftName: 'Petrolhead' },
  coffee:              { displayName: 'Coffee',               icon: 'coffeeicon-sheet0.png',      description: 'From bean to cup — all things coffee',                        completionNftTokenId: 5,  completionNftName: 'Barista Master' },
  countriesineurope:   { displayName: 'Countries in Europe',  icon: 'countriesineurope-sheet0.png', description: 'Explore the nations and capitals of Europe',                completionNftTokenId: 6,  completionNftName: 'Euro Explorer' },
  finishthemovietitle: { displayName: 'Finish the Movie Title', icon: 'finishthemovietitle-sheet0.png', description: 'Complete the famous movie titles',                     completionNftTokenId: 7,  completionNftName: 'Film Buff' },
  gameofthrones:       { displayName: 'Game of Thrones',      icon: 'gameofthrones-sheet0.png',   description: 'All things from the world of Westeros',                       completionNftTokenId: 8,  completionNftName: 'Maester of Lore' },
  generalknowledge:    { displayName: 'General Knowledge',    icon: 'generaknowledge-sheet0.png', description: 'Broad trivia across all fields of knowledge',                 completionNftTokenId: 9,  completionNftName: 'Knowledge Master' },
  generalmath:         { displayName: 'General Math',         icon: 'generalmath-sheet0.png',     description: 'Push your mathematical reasoning further',                    completionNftTokenId: 10, completionNftName: 'Number Genius' },
  grammar:             { displayName: 'Grammar',              icon: 'grammar-sheet0.png',         description: 'Put your English grammar skills to the test',                 completionNftTokenId: 11, completionNftName: 'Grammar Guru' },
  historytrivia:       { displayName: 'History Trivia',       icon: 'generaknowledge-sheet0.png', description: 'Journey through the key events of world history',             completionNftTokenId: 12, completionNftName: 'History Buff' },
  howimetyourmother:   { displayName: 'How I Met Your Mother', icon: 'howimetyourmother-sheet0.png', description: 'Quiz for fans of the legendary sitcom',                   completionNftTokenId: 13, completionNftName: 'HIMYM Fan' },
  internetculture:     { displayName: 'Internet Culture',     icon: 'internet-sheet0.png',        description: 'Memes, viral moments, and digital culture',                   completionNftTokenId: 14, completionNftName: 'Netizen' },
  namethecountry:      { displayName: 'Name the Country',     icon: 'namethecountry-sheet0.png',  description: 'Identify countries from flags and hints',                     completionNftTokenId: 15, completionNftName: 'World Traveller' },
  namethesoccerplayer: { displayName: 'Name the Soccer Player', icon: 'namethesoccerplayer-sheet0.png', description: 'Identify famous football stars',                      completionNftTokenId: 16, completionNftName: 'Football Fan' },
  riddles:             { displayName: 'Riddles',              icon: 'generaknowledge-sheet0.png', description: 'Tricky riddles to challenge your lateral thinking',           completionNftTokenId: 17, completionNftName: 'Riddle Master' },
  simpsons:            { displayName: 'The Simpsons',         icon: 'familyguyicon-sheet0.png',   description: 'D\'oh! How well do you know Springfield?',                   completionNftTokenId: 18, completionNftName: 'Springfield Resident' },
  soccer:              { displayName: 'Soccer',               icon: 'soccericon-sheet0.png',      description: 'The beautiful game — trivia for football fans',               completionNftTokenId: 19, completionNftName: 'Soccer Pro' },
  thefamilyguy:        { displayName: 'Family Guy',           icon: 'familyguyicon-sheet0.png',   description: 'Stewie, Peter, and the whole Griffin family',                 completionNftTokenId: 20, completionNftName: 'Quahog Citizen' },
  thewalkingdead:      { displayName: 'The Walking Dead',     icon: 'thewalkingdead-sheet0.png',  description: 'Survive the zombie apocalypse with your knowledge',           completionNftTokenId: 21, completionNftName: 'Survivor' },
  worddefinition:      { displayName: 'Word Definitions',     icon: 'worddefinitions2-sheet0.png', description: 'Expand your vocabulary with word definition challenges',     completionNftTokenId: 22, completionNftName: 'Lexicon Master' },
};

// ─── Difficulty Mapping ───────────────────────────────────────────────────────
function getTimeLimit(difficulty: string, questionIndex: number): number {
  // Later questions are slightly harder
  const baseTime = difficulty === 'high' ? 8 : difficulty === 'medium' ? 12 : 15;
  // Gradually reduce time as questions progress (every 25 questions, -1s, min 6s)
  const reduction = Math.floor(questionIndex / 25);
  return Math.max(baseTime - reduction, 6);
}

function getPoints(difficulty: string, questionIndex: number): number {
  const base = difficulty === 'high' ? 30 : difficulty === 'medium' ? 20 : 10;
  // Questions deeper in the set are worth more
  const bonus = Math.floor(questionIndex / 20) * 5;
  return base + bonus;
}

function getDifficultyLabel(difficulty: string, questionIndex: number): 'easy' | 'medium' | 'hard' | 'expert' {
  if (difficulty === 'high' || questionIndex >= 75) return 'expert';
  if (difficulty === 'medium' || questionIndex >= 50) return 'hard';
  if (questionIndex >= 25) return 'medium';
  return 'easy';
}

// ─── Milestone NFT logic ──────────────────────────────────────────────────────
let milestoneNftTokenId = 101; // Start milestone IDs at 101

function getMilestoneNft(questionIndex: number, categoryName: string): object | null {
  // Award milestone NFTs at Q25, Q50, Q75
  const milestones: Record<number, { name: string; description: string }> = {
    24: { name: `${categoryName} Novice`,    description: `Answered 25 questions in ${categoryName}` },
    49: { name: `${categoryName} Apprentice`, description: `Answered 50 questions in ${categoryName}` },
    74: { name: `${categoryName} Expert`,    description: `Answered 75 questions in ${categoryName}` },
  };

  if (milestones[questionIndex]) {
    const nft = {
      tokenId: milestoneNftTokenId++,
      ...milestones[questionIndex],
    };
    return nft;
  }
  return null;
}

// ─── XML Parser ───────────────────────────────────────────────────────────────
interface ParsedQuestion {
  id: number;
  text: string;
  difficulty: string;
  options: { text: string; isCorrect: boolean }[];
}

function parseXml(xml: string): ParsedQuestion[] {
  const questions: ParsedQuestion[] = [];

  // Match each Question block and its options
  // Questions can have id and difficulty in any order as attributes
  const questionRegex = /<Question[^>]*id=['"](\d+)['"][^>]*difficulty=['"]([^'"]+)['"][^>]*>([\s\S]*?)<\/Question>/gi;
  const questionRegex2 = /<Question[^>]*difficulty=['"]([^'"]+)['"][^>]*id=['"](\d+)['"][^>]*>([\s\S]*?)<\/Question>/gi;

  // Build a map of id → difficulty and question text from both patterns
  const qMap: Record<string, { text: string; difficulty: string }> = {};

  // Pattern 1: id first, then difficulty
  let match;
  const xml2 = xml;

  // Use a unified approach: find all Question tags
  const allQRegex = /<Question\s+([^>]+)>([\s\S]*?)<\/Question>/gi;
  while ((match = allQRegex.exec(xml)) !== null) {
    const attrs = match[1];
    const rawText = match[2];
    const idMatch = /id=['"](\d+)['"]/i.exec(attrs);
    const diffMatch = /difficulty=['"]([^'"]+)['"]/i.exec(attrs);
    if (idMatch && diffMatch) {
      const id = idMatch[1];
      // Clean text: remove leading dashes/spaces, collapse whitespace
      const text = rawText.replace(/[-]+/g, '').replace(/\s+/g, ' ').trim();
      qMap[id] = { text, difficulty: diffMatch[1] };
    }
  }

  // Now parse options for each id
  for (const [idStr, qData] of Object.entries(qMap)) {
    const id = parseInt(idStr);
    const options: { text: string; isCorrect: boolean }[] = [];

    // Match OptionA, OptionB, OptionC for this id
    for (const optLetter of ['A', 'B', 'C']) {
      const optRegex = new RegExp(`<Option${optLetter}\\s+id=['"]${id}['"]\\s+type=['"]([01])['"]\s*>([^<]*)<\/Option${optLetter}>`, 'i');
      const optMatch = optRegex.exec(xml);
      if (optMatch) {
        options.push({
          text: optMatch[2].replace(/^:/, '').trim(),
          isCorrect: optMatch[1] === '1',
        });
      }
    }

    if (options.length === 3) {
      questions.push({
        id,
        text: qData.text,
        difficulty: qData.difficulty,
        options,
      });
    }
  }

  // Sort by question id
  questions.sort((a, b) => a.id - b.id);
  return questions;
}

// ─── JSON Output Structure ────────────────────────────────────────────────────
interface QuizJson {
  category: string;
  displayName: string;
  icon: string;
  description: string;
  totalQuestions: number;
  completionNft: { tokenId: number; name: string; description: string };
  questions: {
    id: number;
    text: string;
    difficulty: 'easy' | 'medium' | 'hard' | 'expert';
    timeLimit: number;
    points: number;
    options: { text: string; isCorrect: boolean }[];
    hint: string;
    explanation: string;
    milestoneNft: object | null;
  }[];
}

// ─── Main Converter ───────────────────────────────────────────────────────────
function convertXmlToJson(filePath: string, categoryKey: string): QuizJson {
  const xml = fs.readFileSync(filePath, 'utf-8');
  const parsed = parseXml(xml);
  const meta = CATEGORY_META[categoryKey];

  const displayName = meta?.displayName ?? categoryKey;

  const questions = parsed.map((q, index) => ({
    id: q.id,
    text: q.text,
    difficulty: getDifficultyLabel(q.difficulty, index),
    timeLimit: getTimeLimit(q.difficulty, index),
    points: getPoints(q.difficulty, index),
    options: q.options,
    hint: '',         // To be enriched manually or via AI later
    explanation: '',  // To be enriched manually or via AI later
    milestoneNft: getMilestoneNft(index, displayName),
  }));

  return {
    category: categoryKey,
    displayName,
    icon: meta?.icon ?? 'generaknowledge-sheet0.png',
    description: meta?.description ?? `Test your ${displayName} knowledge`,
    totalQuestions: questions.length,
    completionNft: {
      tokenId: meta?.completionNftTokenId ?? 99,
      name: meta?.completionNftName ?? `${displayName} Champion`,
      description: `Awarded for completing all questions in the ${displayName} category`,
    },
    questions,
  };
}

function main() {
  const quizDir = path.resolve(__dirname, '../quiz_content');
  const xmlFiles = fs.readdirSync(quizDir).filter(f => f.endsWith('.xml') && f !== 'players.xml');

  console.log(`Found ${xmlFiles.length} XML files to convert...`);

  let converted = 0;
  let failed = 0;

  for (const file of xmlFiles) {
    const categoryKey = file.replace('.xml', '');
    const inputPath = path.join(quizDir, file);
    const outputPath = path.join(quizDir, `${categoryKey}.json`);

    try {
      const json = convertXmlToJson(inputPath, categoryKey);
      fs.writeFileSync(outputPath, JSON.stringify(json, null, 2), 'utf-8');
      console.log(`✅ ${file} → ${categoryKey}.json (${json.totalQuestions} questions)`);
      converted++;
    } catch (err) {
      console.error(`❌ Failed: ${file}`, err);
      failed++;
    }
  }

  console.log(`\nDone! Converted: ${converted}, Failed: ${failed}`);
  console.log(`Next milestoneNftTokenId: ${milestoneNftTokenId}`);
}

main();
