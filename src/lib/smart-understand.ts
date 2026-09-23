/**
 * Smart understanding layer — interpret messy human input the way a friend would:
 * typos, slang, shorthand, voice-to-text errors, and follow-ups that rely on context.
 */
import { resolveBreedId, getBreedKnowledgeSnippet } from "@/lib/dog-offline";

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type DogTopic =
  | "training"
  | "food"
  | "health"
  | "grooming"
  | "apartment"
  | "choose"
  | "toxic"
  | null;

export type UnderstoodTurn = {
  /** Original user text */
  raw: string;
  /** Cleaned / expanded text */
  cleaned: string;
  /** Clear question we believe they meant (for the LLM) */
  interpreted: string;
  breedId: string | null;
  breedLabel: string | null;
  topic: DogTopic;
  isFollowUp: boolean;
  /** Extra grounding block for RAG / system prompt */
  contextBlock: string;
};

export function detectTopic(text: string): DogTopic {
  const t = text.toLowerCase();
  if (/toxic|chocolat|xylitol|grape|raisin|onion|oignon|poison|never eat|ne jamais|can (?:dogs?|they) eat|safe (?:for|to)/.test(t))
    return "toxic";
  if (/train|éduc|puppy|chiot|leash|laisse|bark|aboie|obedi|sociali|behav|agress|aggress|bite|chew|rappel|sit|stay/.test(t))
    return "training";
  if (/food|diet|feed|eat|kibble|croquette|aliment|friandise|treat|nutrition|hungry|meal/.test(t))
    return "food";
  if (/groom|toilet|coat|poil|shed|mue|brush|hair|hypoallergenic|allerg/.test(t))
    return "grooming";
  if (/apart|appartement|flat|condo|small space|petit espace|city|ville/.test(t))
    return "apartment";
  if (/health|santé|vet|véto|hip|dysplas|allerg|sick|ill|pain/.test(t))
    return "health";
  if (/choose|choisir|which breed|quelle race|best dog|bon chien|first dog|premier|good (?:for|with) (?:kids|family|apart)/.test(t))
    return "choose";
  return null;
}

const SLANG: Array<[RegExp, string]> = [
  [/\b(?:wanna|wan2)\b/gi, "want to"],
  [/\b(?:gonna|gon2)\b/gi, "going to"],
  [/\b(?:gotta)\b/gi, "got to"],
  [/\b(?:kinda|kind of)\b/gi, "kind of"],
  [/\b(?:imo|imho)\b/gi, "in my opinion"],
  [/\b(?:idk)\b/gi, "I don't know"],
  [/\b(?:idc)\b/gi, "I don't care"],
  [/\b(?:tbh)\b/gi, "to be honest"],
  [/\b(?:pls|plz|plzz)\b/gi, "please"],
  [/\b(?:thx|thanx|ty)\b/gi, "thanks"],
  [/\b(?:u)\b/gi, "you"],
  [/\b(?:ur)\b/gi, "your"],
  [/\b(?:r)\b/gi, "are"],
  [/\b(?:y)\b/gi, "why"],
  [/\b(?:whats)\b/gi, "what's"],
  [/\b(?:whts|wot)\b/gi, "what"],
  [/\b(?:abt|bout)\b/gi, "about"],
  [/\b(?:info|infos)\b/gi, "information"],
  [/\b(?:tell me abt|tell me bout)\b/gi, "tell me about"],
  [/\b(?:how r|howre)\b/gi, "how are"],
  [/\b(?:can u|can youu+)\b/gi, "can you"],
  [/\b(?:doggo|doggie|puppers?)\b/gi, "dog"],
  [/\b(?:pupper)\b/gi, "puppy"],
  [/\b(?:good boye?|good girl)\b/gi, "good dog"],
  [/\b(?:appart|apt)\b/gi, "apartment"],
  [/\b(?:groomin|groomng)\b/gi, "grooming"],
  [/\b(?:trainin|trainng)\b/gi, "training"],
  [/\b(?:behavio?ur)\b/gi, "behavior"],
  [/\b(?:agressive)\b/gi, "aggressive"],
  [/\b(?:hipoallergenic|hypoalergenic)\b/gi, "hypoallergenic"],
  [/\b(?:shedding|sheding)\b/gi, "shedding"],
];

const BREED_LABELS: Record<string, string> = {
  poodle: "Poodle",
  labrador: "Labrador Retriever",
  shepherd: "German Shepherd",
  golden: "Golden Retriever",
  frenchie: "French Bulldog",
  beagle: "Beagle",
  collie: "Collie / Border Collie",
  dachshund: "Dachshund",
  husky: "Siberian Husky",
  shiba: "Shiba Inu",
  bulldog: "English Bulldog",
  yorkie: "Yorkshire Terrier",
  boxer: "Boxer",
  rottweiler: "Rottweiler",
  australian: "Australian Shepherd",
  corgi: "Corgi",
  maltese: "Maltese",
  akita: "Akita",
  pitbull: "pit bull–type / bully breed",
  chihuahua: "Chihuahua",
  malinois: "Belgian Malinois",
  dane: "Great Dane",
  newfoundland: "Newfoundland",
  bernese: "Bernese Mountain Dog",
  cavalier: "Cavalier King Charles Spaniel",
  shihtzu: "Shih Tzu",
  pomeranian: "Pomeranian",
  whippet: "Whippet",
  greyhound: "Greyhound",
  doberman: "Doberman",
  samoyed: "Samoyed",
  jackrussell: "Jack Russell Terrier",
  weimaraner: "Weimaraner",
};

function cleanSlang(text: string): string {
  let out = text.replace(/\s+/g, " ").trim();
  for (const [re, to] of SLANG) out = out.replace(re, to);
  return out.replace(/\s+/g, " ").trim();
}

function isSoftFollowUp(text: string, hasBreedNow: boolean): boolean {
  if (hasBreedNow) return false;
  const t = text.trim().toLowerCase();
  return (
    /^(tell me more|more(?:\s+please)?|and then|what about (?:that|them|it|him|her)\b|how about (?:that|them|it)\b|go on|continue|another angle|and\??|yes|yeah|yep|ok|okay)\b/i.test(
      t
    ) ||
    /^(dis-moi plus|encore|et (?:ensuite|après)|autre angle|continue|oui|ouais)\b/i.test(
      t
    ) ||
    /^(training|diet|food|grooming|apartment|health|éducation|alimentation|toilettage|appart|santé)\b/i.test(
      t
    ) ||
    t.length < 28
  );
}

function priorBreedFromHistory(history: ChatMessage[]): string | null {
  for (let i = history.length - 1; i >= 0; i--) {
    const id = resolveBreedId(history[i]!.content);
    if (id) return id;
  }
  return null;
}

/**
 * Interpret what the human meant — used before LLM / offline answers.
 */
export function understandUserTurn(
  userText: string,
  locale: "en" | "fr",
  history: ChatMessage[] = []
): UnderstoodTurn {
  const raw = userText.trim();
  const cleaned = cleanSlang(raw);
  const namedNow = resolveBreedId(cleaned) || resolveBreedId(raw);
  const followUp = isSoftFollowUp(cleaned, Boolean(namedNow));
  const breedId = namedNow || (followUp ? priorBreedFromHistory(history) : null);
  const breedLabel = breedId ? BREED_LABELS[breedId] || breedId : null;
  const topic = detectTopic(cleaned) || detectTopic(raw);

  let interpreted = cleaned;
  if (locale === "fr") {
    if (breedLabel && topic) {
      interpreted = `Parle-moi de ${breedLabel} — angle ${topic}. Message d'origine: "${raw}"`;
    } else if (breedLabel) {
      interpreted = `Dis-moi tout sur la race ${breedLabel} (histoire, caractère, besoins). Message d'origine: "${raw}"`;
    } else if (topic) {
      interpreted = `Question chiens sur: ${topic}. Message d'origine: "${raw}"`;
    } else if (cleaned !== raw) {
      interpreted = cleaned;
    }
  } else {
    if (breedLabel && topic) {
      interpreted = `Tell me about ${breedLabel}, focusing on ${topic}. Original message: "${raw}"`;
    } else if (breedLabel) {
      interpreted = `Tell me about the ${breedLabel} dog breed — history, temperament, energy, care, and watch-outs. Original message: "${raw}"`;
    } else if (topic) {
      interpreted = `Dog question about ${topic}. Original message: "${raw}"`;
    } else if (cleaned !== raw) {
      interpreted = cleaned;
    }
  }

  const snippet =
    getBreedKnowledgeSnippet(cleaned, locale) ||
    getBreedKnowledgeSnippet(raw, locale) ||
    (breedId ? getBreedKnowledgeSnippet(breedLabel || breedId, locale) : null);

  const parts: string[] = [];
  if (locale === "fr") {
    parts.push(`INTERPRÉTATION: l'utilisateur a probablement voulu dire → ${interpreted}`);
    if (breedLabel) parts.push(`RACE DÉTECTÉE: ${breedLabel}`);
    if (topic) parts.push(`SUJET: ${topic}`);
    if (followUp && breedLabel)
      parts.push(`SUIVI: reste sur ${breedLabel} (ne redemande pas la race).`);
    parts.push(
      "COMPRIS COMME UN HUMAIN: corrige fautes/typos/argot, réponds à l'intention, pas seulement aux mots exacts."
    );
  } else {
    parts.push(`INTERPRETATION: the user likely meant → ${interpreted}`);
    if (breedLabel) parts.push(`DETECTED BREED: ${breedLabel}`);
    if (topic) parts.push(`TOPIC: ${topic}`);
    if (followUp && breedLabel)
      parts.push(`FOLLOW-UP: stay on ${breedLabel} (don't re-ask which breed).`);
    parts.push(
      "HUMAN UNDERSTANDING: fix typos/slang/voice errors; answer the intent, not only the exact words."
    );
  }
  if (snippet) {
    parts.push(
      locale === "fr"
        ? `FAITS RACE (source de vérité):\n${snippet}`
        : `BREED FACTS (source of truth):\n${snippet}`
    );
  }

  return {
    raw,
    cleaned,
    interpreted,
    breedId,
    breedLabel,
    topic,
    isFollowUp: followUp,
    contextBlock: parts.join("\n"),
  };
}

/** Messages for the LLM: history + interpreted last user turn */
export function messagesForLlm(
  history: ChatMessage[],
  understood: UnderstoodTurn
): ChatMessage[] {
  return [
    ...history,
    {
      role: "user",
      content: understood.interpreted,
    },
  ];
}
