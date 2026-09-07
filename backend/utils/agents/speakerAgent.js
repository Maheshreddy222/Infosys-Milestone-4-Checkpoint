const { getDb } = require('../../db/database');
const { findConflicts } = require('../conflicts');

// ============================================================
// SPEAKER AGENT
// When multiple speakers are suitable for the same topic, they are
// ranked by a weighted score across: topic relevance, language
// proficiency, experience, prior audience feedback/engagement, and
// budget fit. Availability is a HARD filter, not a scored factor —
// a speaker double-booked for the requested date/time is excluded
// outright rather than merely ranked lower.
// ============================================================

const WEIGHTS = {
  topicRelevance: 35,
  language: 15,
  experience: 15,
  engagement: 25,
  budget: 10,
};

function scoreTopicRelevance(speaker, topic) {
  if (!topic) return WEIGHTS.topicRelevance;
  const topicWords = topic.toLowerCase().split(/[,\s]+/).filter(Boolean);
  const expertise = (speaker.expertise || '').toLowerCase();
  const expertiseTerms = expertise.split(',').map((s) => s.trim()).filter(Boolean);

  if (expertiseTerms.some((term) => term === topic.toLowerCase())) return WEIGHTS.topicRelevance; // exact match
  const matched = topicWords.filter((w) => expertise.includes(w));
  if (matched.length === 0) return Math.round(WEIGHTS.topicRelevance * 0.15); // weak/no relevance, still rankable
  return Math.round(WEIGHTS.topicRelevance * Math.min(1, matched.length / topicWords.length));
}

function scoreLanguage(speaker, languagePreference) {
  if (!languagePreference) return WEIGHTS.language;
  if (speaker.language.toLowerCase() === languagePreference.toLowerCase()) return WEIGHTS.language;
  return Math.round(WEIGHTS.language * 0.3); // can likely still present, but not a native/preferred match
}

function scoreExperience(speaker) {
  const years = Math.max(0, speaker.experience_years || 0);
  return Math.round(WEIGHTS.experience * Math.min(1, years / 12));
}

function scoreEngagement(speaker) {
  return Math.round(WEIGHTS.engagement * (Math.min(5, Math.max(1, speaker.engagement_score)) / 5));
}

function scoreBudget(speaker, budget) {
  if (!budget) return WEIGHTS.budget;
  if (speaker.fee > budget) return 0;
  const savingsRatio = (budget - speaker.fee) / budget;
  return Math.round(WEIGHTS.budget * Math.min(1, 0.5 + savingsRatio));
}

// Availability is a hard filter: check the speaker's own stated
// windows (if any) AND that they have no conflicting session booked.
function isAvailable(speaker, eventId, date, startTime, endTime) {
  if (date && speaker.available_dates) {
    const dates = speaker.available_dates.split(',').map((d) => d.trim()).filter(Boolean);
    if (dates.length && !dates.includes(date)) return false;
  }
  if (startTime && endTime && speaker.available_start && speaker.available_end) {
    if (startTime < speaker.available_start || endTime > speaker.available_end) return false;
  }
  if (date && startTime && endTime) {
    if (findConflicts(eventId, 'speaker_id', speaker.id, date, startTime, endTime).length > 0) return false;
  }
  return true;
}

function buildReasoning(speaker, topic) {
  const bits = [];
  if (topic) bits.push(`expertise matches "${topic}"`);
  bits.push(`${speaker.experience_years} yrs experience`);
  bits.push(`${speaker.engagement_score}/5 audience feedback`);
  bits.push(`presents in ${speaker.language}`);
  return `Recommended: ${bits.join(', ')}.`;
}

function recommendSpeakers(eventId, requirements) {
  const db = getDb();
  const { topic = '', date, startTime, endTime, budget = 0, languagePreference = '' } = requirements;

  // Speakers are a shared resource across all events.
  let speakers = db.prepare('SELECT * FROM speakers').all();

  // Hard filter: availability (own stated windows + no double-booking).
  speakers = speakers.filter((sp) => isAvailable(sp, eventId, date, startTime, endTime));

  const results = speakers.map((speaker) => {
    const breakdown = {
      topicRelevance: scoreTopicRelevance(speaker, topic),
      language: scoreLanguage(speaker, languagePreference),
      experience: scoreExperience(speaker),
      engagement: scoreEngagement(speaker),
      budget: scoreBudget(speaker, budget),
    };
    const total = Math.min(100, Object.values(breakdown).reduce((a, b) => a + b, 0));
    return {
      speaker,
      score: total,
      breakdown,
      reasoning: buildReasoning(speaker, topic),
    };
  });

  // Tie-break order when scores are equal: higher engagement, then more experience.
  results.sort((a, b) => b.score - a.score || b.speaker.engagement_score - a.speaker.engagement_score || b.speaker.experience_years - a.speaker.experience_years);
  return results;
}

module.exports = { recommendSpeakers, WEIGHTS };
