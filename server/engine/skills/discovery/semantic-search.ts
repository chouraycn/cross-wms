import type { SkillEntry } from "../types.js";
import { normalizeSkillName } from "./filter.js";
import { logger } from "../../../logger.js";

export type SearchResult = {
  skillName: string;
  score: number;
  matchType: "exact" | "fuzzy" | "semantic" | "tag";
  highlights?: string[];
};

export type SearchIndex = {
  invertedIndex: Map<string, Set<string>>;
  vectorIndex: Map<string, number[]>;
  skillMetadata: Map<string, { name: string; description: string; tags: string[] }>;
};

function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1,
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-zA-Z0-9\u4e00-\u9fa5\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1);
}

function computeTFIDFVector(tokens: string[], allTokens: Set<string>, documentCount: number): number[] {
  const termFreq = new Map<string, number>();
  tokens.forEach((token) => {
    termFreq.set(token, (termFreq.get(token) || 0) + 1);
  });
  const maxFreq = Math.max(...termFreq.values(), 1);
  const vector: number[] = [];
  allTokens.forEach((token) => {
    const tf = (termFreq.get(token) || 0) / maxFreq;
    const idf = Math.log(documentCount / (termFreq.has(token) ? 1 : 1));
    vector.push(tf * idf);
  });
  return vector;
}

function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) return 0;
  let dotProduct = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    magA += vecA[i] * vecA[i];
    magB += vecB[i] * vecB[i];
  }
  if (magA === 0 || magB === 0) return 0;
  return dotProduct / (Math.sqrt(magA) * Math.sqrt(magB));
}

export function buildSkillIndex(skills: readonly SkillEntry[]): SearchIndex {
  const invertedIndex = new Map<string, Set<string>>();
  const skillMetadata = new Map<string, { name: string; description: string; tags: string[] }>();
  const allTokens = new Set<string>();

  skills.forEach((entry) => {
    const skillKey = normalizeSkillName(entry.skill.name);
    const nameTokens = tokenize(entry.skill.name);
    const descTokens = tokenize(entry.skill.description);
    const tags: string[] = [];
    
    if (entry.frontmatter) {
      const tagStr = entry.frontmatter["tags"] || entry.frontmatter["categories"] || "";
      tags.push(...tokenize(tagStr));
    }
    
    const allSkillTokens = [...nameTokens, ...descTokens, ...tags];
    allSkillTokens.forEach((token) => allTokens.add(token));
    
    allSkillTokens.forEach((token) => {
      if (!invertedIndex.has(token)) {
        invertedIndex.set(token, new Set());
      }
      invertedIndex.get(token)!.add(skillKey);
    });
    
    skillMetadata.set(skillKey, {
      name: entry.skill.name,
      description: entry.skill.description,
      tags,
    });
  });

  const vectorIndex = new Map<string, number[]>();
  skills.forEach((entry) => {
    const skillKey = normalizeSkillName(entry.skill.name);
    const tokens = [
      ...tokenize(entry.skill.name),
      ...tokenize(entry.skill.description),
      ...(skillMetadata.get(skillKey)?.tags || []),
    ];
    const vector = computeTFIDFVector(tokens, allTokens, skills.length);
    vectorIndex.set(skillKey, vector);
  });

  logger.debug(`Built semantic search index with ${invertedIndex.size} terms for ${skills.length} skills`);

  return { invertedIndex, vectorIndex, skillMetadata };
}

export function fuzzySearch(
  query: string,
  skills: readonly SkillEntry[],
  threshold: number = 0.7,
): SearchResult[] {
  const results: SearchResult[] = [];
  const normalizedQuery = normalizeSkillName(query);
  
  if (!normalizedQuery) return results;

  skills.forEach((entry) => {
    const normalizedName = normalizeSkillName(entry.skill.name);
    const normalizedDesc = entry.skill.description.toLowerCase();
    
    const nameDistance = levenshteinDistance(normalizedQuery, normalizedName);
    const nameMaxLen = Math.max(normalizedQuery.length, normalizedName.length);
    const nameScore = nameMaxLen > 0 ? 1 - nameDistance / nameMaxLen : 0;
    
    if (nameScore >= threshold) {
      results.push({
        skillName: entry.skill.name,
        score: nameScore,
        matchType: "fuzzy",
        highlights: [entry.skill.name],
      });
      return;
    }
    
    const descTokens = normalizedDesc.split(/\s+/);
    descTokens.forEach((token) => {
      const tokenDistance = levenshteinDistance(normalizedQuery, token);
      const tokenMaxLen = Math.max(normalizedQuery.length, token.length);
      const tokenScore = tokenMaxLen > 0 ? 1 - tokenDistance / tokenMaxLen : 0;
      
      if (tokenScore >= threshold && tokenScore > 0) {
        results.push({
          skillName: entry.skill.name,
          score: tokenScore * 0.6,
          matchType: "fuzzy",
          highlights: [token],
        });
      }
    });
  });

  return results.sort((a, b) => b.score - a.score);
}

export function semanticSearch(
  query: string,
  skills: readonly SkillEntry[],
  topK: number = 10,
): SearchResult[] {
  const index = buildSkillIndex(skills);
  const queryTokens = tokenize(query);
  const allTokens = new Set<string>();
  
  index.invertedIndex.forEach((_, token) => allTokens.add(token));
  queryTokens.forEach((token) => allTokens.add(token));
  
  const queryVector = computeTFIDFVector(queryTokens, allTokens, skills.length);
  const results: SearchResult[] = [];

  index.vectorIndex.forEach((vector, skillKey) => {
    const metadata = index.skillMetadata.get(skillKey);
    if (!metadata) return;
    
    const similarity = cosineSimilarity(queryVector, vector);
    
    if (similarity > 0) {
      const highlights: string[] = [];
      queryTokens.forEach((token) => {
        if (metadata.name.toLowerCase().includes(token)) {
          highlights.push(metadata.name);
        } else if (metadata.description.toLowerCase().includes(token)) {
          highlights.push(token);
        }
      });
      
      results.push({
        skillName: metadata.name,
        score: similarity,
        matchType: "semantic",
        highlights: highlights.length > 0 ? highlights : undefined,
      });
    }
  });

  const sorted = results.sort((a, b) => b.score - a.score);
  return sorted.slice(0, topK);
}

export type CombinedSearchOptions = {
  topK?: number;
  fuzzyThreshold?: number;
  exactBoost?: number;
  fuzzyBoost?: number;
  semanticBoost?: number;
  tagBoost?: number;
};

export function combinedSearch(
  query: string,
  skills: readonly SkillEntry[],
  options: CombinedSearchOptions = {},
): SearchResult[] {
  const {
    topK = 10,
    fuzzyThreshold = 0.6,
    exactBoost = 2.0,
    fuzzyBoost = 0.8,
    semanticBoost = 1.0,
    tagBoost = 1.5,
  } = options;

  const normalizedQuery = normalizeSkillName(query);
  const resultsMap = new Map<string, SearchResult>();

  if (normalizedQuery) {
    skills.forEach((entry) => {
      const normalizedName = normalizeSkillName(entry.skill.name);
      const normalizedSkillKey = normalizeSkillName(entry.skill.name);
      
      if (normalizedName === normalizedQuery || normalizedSkillKey === normalizedQuery) {
        resultsMap.set(entry.skill.name, {
          skillName: entry.skill.name,
          score: exactBoost * 1.0,
          matchType: "exact",
          highlights: [entry.skill.name],
        });
        return;
      }
      
      if (normalizedName.includes(normalizedQuery) || normalizedSkillKey.includes(normalizedQuery)) {
        const existing = resultsMap.get(entry.skill.name);
        const score = exactBoost * (normalizedName.includes(normalizedQuery) ? 0.9 : 0.8);
        if (!existing || score > existing.score) {
          resultsMap.set(entry.skill.name, {
            skillName: entry.skill.name,
            score,
            matchType: "exact",
            highlights: [entry.skill.name],
          });
        }
      }
      
      const description = entry.skill.description.toLowerCase();
      if (description.includes(query.toLowerCase())) {
        const existing = resultsMap.get(entry.skill.name);
        const score = exactBoost * 0.7;
        if (!existing || score > existing.score) {
          resultsMap.set(entry.skill.name, {
            skillName: entry.skill.name,
            score,
            matchType: "exact",
            highlights: [query],
          });
        }
      }
    });
  }

  const fuzzyResults = fuzzySearch(query, skills, fuzzyThreshold);
  fuzzyResults.forEach((result) => {
    const existing = resultsMap.get(result.skillName);
    const boostedScore = result.score * fuzzyBoost;
    if (!existing || boostedScore > existing.score) {
      resultsMap.set(result.skillName, {
        ...result,
        score: boostedScore,
      });
    }
  });

  const semanticResults = semanticSearch(query, skills, topK * 2);
  semanticResults.forEach((result) => {
    const existing = resultsMap.get(result.skillName);
    const boostedScore = result.score * semanticBoost;
    if (!existing || boostedScore > existing.score) {
      resultsMap.set(result.skillName, {
        ...result,
        score: boostedScore,
      });
    }
  });

  skills.forEach((entry) => {
    const tags = entry.frontmatter?.tags || "";
    if (typeof tags === "string" && tags.toLowerCase().includes(query.toLowerCase())) {
      const existing = resultsMap.get(entry.skill.name);
      const score = tagBoost * 0.9;
      if (!existing || score > existing.score) {
        resultsMap.set(entry.skill.name, {
          skillName: entry.skill.name,
          score,
          matchType: "tag",
          highlights: [tags],
        });
      }
    }
  });

  const results = Array.from(resultsMap.values()).sort((a, b) => b.score - a.score);
  return results.slice(0, topK);
}

export function suggestSkills(
  query: string,
  skills: readonly SkillEntry[],
  limit: number = 5,
): string[] {
  const normalizedQuery = normalizeSkillName(query);
  
  if (!normalizedQuery) {
    return skills.slice(0, limit).map((s) => s.skill.name);
  }

  const suggestions: { name: string; score: number }[] = [];

  skills.forEach((entry) => {
    const normalizedName = normalizeSkillName(entry.skill.name);
    
    if (normalizedName.startsWith(normalizedQuery)) {
      suggestions.push({ name: entry.skill.name, score: 1.0 });
    } else if (normalizedName.includes(normalizedQuery)) {
      suggestions.push({ name: entry.skill.name, score: 0.8 });
    } else {
      const distance = levenshteinDistance(normalizedQuery, normalizedName);
      const maxLen = Math.max(normalizedQuery.length, normalizedName.length);
      const score = maxLen > 0 ? 1 - distance / maxLen : 0;
      if (score > 0.5) {
        suggestions.push({ name: entry.skill.name, score });
      }
    }
  });

  return suggestions.sort((a, b) => b.score - a.score).slice(0, limit).map((s) => s.name);
}

export function findRelatedSkills(
  skillName: string,
  skills: readonly SkillEntry[],
  limit: number = 5,
): string[] {
  const index = buildSkillIndex(skills);
  const normalizedSkillName = normalizeSkillName(skillName);
  const sourceVector = index.vectorIndex.get(normalizedSkillName);
  
  if (!sourceVector) return [];

  const similarities: { name: string; similarity: number }[] = [];

  index.vectorIndex.forEach((vector, key) => {
    if (key === normalizedSkillName) return;
    const similarity = cosineSimilarity(sourceVector, vector);
    if (similarity > 0) {
      const metadata = index.skillMetadata.get(key);
      if (metadata) {
        similarities.push({ name: metadata.name, similarity });
      }
    }
  });

  return similarities.sort((a, b) => b.similarity - a.similarity).slice(0, limit).map((s) => s.name);
}