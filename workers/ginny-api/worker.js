/**
 * Dooogs! chat API for GitHub Pages.
 * Uses Cloudflare Workers AI (Llama 3.3 70B) — free, no OpenAI key.
 * Optional: set OLLAMA_BASE_URL secret to proxy a public Ollama host instead.
 */

const ALLOWED_ORIGINS = [
  "https://is-studio-hub.github.io",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];

const WORKERS_AI_MODELS = [
  "@cf/meta/llama-3.1-8b-instruct-fp8-fast",
  "@cf/meta/llama-3.2-1b-instruct",
  "@cf/meta/llama-4-scout-17b-16e-instruct",
  "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
];
const WORKERS_AI_MODEL = WORKERS_AI_MODELS[0];
const WHISPER_MODEL = "@cf/openai/whisper";
// Optional secondary Ollama — Workers AI is primary for all devices
const DEFAULT_OLLAMA_BASE_URL = "";
const DEFAULT_OLLAMA_MODEL = "llama3.1:8b";

/** Short-lived TTS cache so phone + desktop get identical audio for the same line */
const ttsCache = new Map();
const TTS_CACHE_MAX = 40;


function corsHeaders(req) {
  const origin = req.headers.get("Origin") || "";
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Frame-Options": "DENY",
    Vary: "Origin",
  };
}

function json(req, body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(req) },
  });
}

function dogExpertSystemPrompt(locale) {
  if (locale === "fr") {
    return `Tu es Dooogs!, une experte mondiale des chiens et des races canines. Tu parles comme une guide chaleureuse, intelligente et naturelle (tu es aussi un caniche virtuel sympathique, sans en faire trop).

MISSION
- Répondre UNIQUEMENT dans l’univers des chiens: races (FCI, AKC, Kennel Club, etc.), histoire, caractère, alimentation (y compris toxiques), éducation, toilettage, santé typique, sport canin, voyage avec un chien, choix de race, clubs/expos.
- Mémoriser le fil et gérer les suivis sans faire répéter l’utilisateur. Ne répète jamais ta réponse précédente mot pour mot — ajoute un nouvel angle.
- Tu connais aussi les types “bully” / pit bull (American Pit Bull Terrier, American Staffordshire Terrier, Staffordshire Bull Terrier): origines, caractère, besoins, mythes vs réalité — nuance, pas sensationnalisme.

RÈGLE D’OR — RÉPONDRE D’ABORD
- Si l’utilisateur nomme une race ou pose une vraie question chiens: DONNE une réponse utile tout de suite (histoire, caractère, énergie, soins).
- INTERDIT de seulement reformuler sa question ou de répondre par une vague question “quelle vibe?”.
- Une question douce à la FIN est OK; le corps doit être informatif (3–5 phrases riches).

HORS SUJET (OBLIGATOIRE)
- Si le message n’est pas vraiment sur les chiens: accroche en 1 phrase, puis bascule vers un angle CHIENS.
- INTERDIT de dire: “je ne parle que de chiens”, “hors sujet”.

CONTINUITÉ
- Lis tout l’historique. Les suivis (“dis-moi plus”, “et l’éducation?”) restent sur le même sujet/race.
- Si un CONTEXTE RACE est fourni ci-dessous, utilise ces faits et développe — ne les ignore pas.

STYLE
- Français naturel, comme une vraie conversation avec une amie experte — chaleureux, vivant, jamais robotique.
- Phrases courtes qui sonnent bien à l’oral (contractions naturelles, “tu”, questions douces).
- Tu peux utiliser <br> pour les sauts de ligne. Pas de markdown (#, **, bullets -).
- Environ 70–140 mots (assez pour répondre, assez court pour être dit à voix haute).
- Termine souvent par une question douce liée aux chiens, comme dans une vraie discussion.

SORTIE
- Réponds UNIQUEMENT avec le texte à afficher/dire (HTML léger <br> OK). Pas de préambule JSON.`;
  }
  return `You are Dooogs!, a world-class expert on dogs and dog breeds. You speak like a warm, intelligent friend who’s great with dogs (you’re also a friendly virtual poodle — light touch, never cartoonish).

MISSION
- Stay ONLY in the dog world: breeds worldwide (FCI, AKC, The Kennel Club, etc.), history, personality, food (including toxic foods), training, grooming, typical health notes, dog sports, traveling with dogs, choosing a breed, clubs/shows.
- Remember conversation context and handle follow-ups without making the user repeat themselves. Never repeat your previous answer verbatim — add a new angle or detail.
- You know “bully” / pit bull–type dogs (American Pit Bull Terrier, American Staffordshire Terrier, Staffordshire Bull Terrier): origins, temperament, needs, myths vs reality — nuanced, never sensational.

GOLDEN RULE — ANSWER FIRST
- If the user names a breed or asks a real dog question: give a useful answer immediately (history, temperament, energy, care).
- NEVER only restate their question or reply with a vague vibes question instead of facts.
- One soft follow-up at the END is fine; the body must be informative (3–5 clear sentences).

OFF-TOPIC (REQUIRED)
- If the message isn’t really about dogs: hook in one light line, then immediately pivot into a related DOG angle.
- NEVER say: “I only talk about dogs”, “that’s off-topic”.

CONTINUITY
- Read the whole chat history. Follow-ups like “tell me more”, “and training?”, “what about food?” continue the same breed/topic.
- If BREED CONTEXT is provided below, use those facts and expand conversationally — do not ignore them.

STYLE
- Sound like a real person on a phone call: warm, clear, conversational — never robotic or lecture-y.
- Short-to-medium sentences that sound good spoken aloud. Contractions are good. Talk with “you,” not essays.
- You may use <br> for line breaks. No markdown headings, bold markers, or "- " bullets.
- Roughly 70–140 words (enough to answer, short enough to speak out loud).
- Often end with a soft dog-related follow-up, like a real chat.

OUTPUT
- Reply ONLY with the user-facing text (light <br> HTML OK). No JSON preamble.`;
}

function suggestionSystemExtra(locale) {
  return locale === "fr"
    ? `Après ta réponse, sur une NOUVELLE ligne exactement comme ceci (obligatoire):
SUGGESTIONS: suggestion 1 | suggestion 2 | suggestion 3
Les suggestions sont de courtes suites LIÉES AUX CHIENS (max 6 mots chacune), même si le message de départ n’en parlait pas.`
    : `After your answer, on a NEW line exactly like this (required):
SUGGESTIONS: suggestion 1 | suggestion 2 | suggestion 3
Suggestions are short DOG-related follow-ups (max 6 words each), even if the user’s message wasn’t about dogs.`;
}

function parseReplyAndSuggestions(raw) {
  const marker = /(?:^|\n)\s*SUGGESTIONS:\s*(.+)\s*$/i;
  const match = raw.match(marker);
  if (!match) return { reply: raw.trim(), suggestions: [] };
  const suggestions = match[1]
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 4);
  return { reply: raw.replace(marker, "").trim(), suggestions };
}

function offlineDogReply(userText, locale) {
  const t = (userText || "").toLowerCase();
  const breeds = [
    { keys: ["poodle", "caniche"], en: "Poodles (Standard, Mini, Toy) are brilliant athletic water dogs with curly low-shed coats that need regular grooming. German water-dog roots, beloved in France; common in Europe and North America. Train with brain games; never chocolate, grapes, xylitol, or onions.", fr: "Les caniches sont des chiens d’eau brillants au poil bouclé peu sujet à la mue, qui demandent un toilettage régulier. Racines allemandes, très aimés en France." },
    { keys: ["labrador", "lab "], en: "Labrador Retrievers are friendly, food-motivated gundogs from Newfoundland’s St. John’s dogs, refined in Britain. High energy, soft mouths, daily walks and training. Watch weight; never chocolate, grapes, xylitol, or cooked bones.", fr: "Le Labrador est un chien de rapport amical, motivé par la nourriture, avec beaucoup d’énergie et besoin d’éducation." },
    { keys: ["german shepherd", "berger allemand", "gsd"], en: "German Shepherds are loyal versatile working dogs — herding roots, police and sport roles. Need structure, training, and serious exercise. Socialize early; avoid toxic human foods.", fr: "Le berger allemand est un chien de travail loyal et polyvalent qui a besoin de structure et d’exercice." },
    { keys: ["golden retriever", "golden"], en: "Golden Retrievers are warm eager gundogs from 19th-century Scotland. Grooming, exercise, and a job (therapy, field, sports). Watch ears and weight; never chocolate, grapes, xylitol, or onions.", fr: "Le Golden Retriever est un chien de rapport chaleureux, gueule douce, très proche des humains." },
    { keys: ["french bulldog", "frenchie", "bouledogue"], en: "French Bulldogs are compact apartment-friendly companions with bat ears. Mind heat and breathing; moderate walks; harnesses; avoid obesity and toxic foods.", fr: "Le bouledogue français est un compagnon compact — attention chaleur et respiration." },
    { keys: ["beagle"], en: "Beagles are merry scent hounds — nose-driven and vocal. Need sniff walks and secure fencing. Food-motivated; watch weight. No chocolate, grapes, or xylitol.", fr: "Le Beagle est un chien courant joyeux, mené par le nez, avec sa voix typique." },
    { keys: ["border collie", "border"], en: "Border Collies are elite herding athletes with intense focus. Need a real job (herding, agility, advanced training) or they invent chaos.", fr: "Le Border Collie est un athlète de troupeau — il lui faut un vrai job." },
    { keys: ["dachshund", "teckel", "doxie"], en: "Dachshunds are bold long-backed badger dogs. Protect the back (ramps, no big jumps). Short walks plus sniff games; watch weight.", fr: "Le teckel est audacieux et bas — protège le dos, évite les grands sauts." },
    { keys: ["husky", "siberian"], en: "Siberian Huskies are endurance sled dogs — athletic, independent, vocal. Need serious exercise and secure fencing; dislike extreme heat.", fr: "Le Husky sibérien est un chien de traîneau d’endurance — beaucoup d’exercice et clôture solide." },
    { keys: ["shiba"], en: "Shiba Inu are compact Japanese spitz — bold, clean, independent. Early socialization and leash manners; seasonal heavy shed; escape artists.", fr: "Le Shiba Inu est un spitz japonais compact — socialisation et laisse tôt." },
    { keys: ["corgi", "pembroke", "cardigan"], en: "Corgis are short-legged Welsh herders with big personalities. Watch weight (long backs); mental work plus walks.", fr: "Le Corgi est un chien de troupeau bas sur pattes — attention au poids." },
    { keys: ["rottweiler", "rott"], en: "Rottweilers are powerful working dogs from Rottweil, Germany. Need early socialization, clear leadership, and exercise with responsible ownership.", fr: "Le Rottweiler est un chien de travail puissant — socialisation précoce et cadre clair." },
    { keys: ["australian shepherd", "aussie"], en: "Australian Shepherds are energetic US ranch herders (despite the name). Need a job — agility, herding, advanced training.", fr: "L’Australian Shepherd est un chien de troupeau énergique qui a besoin d’un job." },
    { keys: ["boxer"], en: "Boxers are bouncy loyal working dogs with a square muzzle. Daily exercise and training; short coats feel cold and heat.", fr: "Le Boxer est joueur et loyal — exercice et éducation quotidiens." },
    { keys: ["yorkshire", "yorkie"], en: "Yorkshire Terriers are tiny confident toy terriers. Dental care, coat upkeep, gentle handling; never chocolate or xylitol.", fr: "Le Yorkshire est un toy terrier confiant — soins dentaires et toilettage." },
    { keys: ["akita"], en: "Akitas are large dignified Japanese spitz dogs. Experienced handling, socialization, and space; thick seasonal coat.", fr: "L’Akita est un grand spitz japonais digne — main experte et socialisation." },
    { keys: ["pitbull", "pit bull", "pit-bull", "pittie", "pitty", "american pit bull", "amstaff", "american staffordshire", "staffordshire bull", "staffy", "staffie", "bully"], en: "“Pit bull” usually means bully-type dogs like the American Pit Bull Terrier, plus cousins such as the American Staffordshire Terrier and Staffordshire Bull Terrier — not one single worldwide kennel name. Bull-and-terrier roots; many are affectionate, athletic, and people-oriented when raised well. Need daily exercise, early socialization, solid manners, and a consistent owner. Sturdy harness on walks; never chocolate, grapes, xylitol, or onions. Responsible ownership and local laws matter more than labels.", fr: "« Pit bull » désigne surtout des bully comme l’American Pit Bull Terrier, proches de l’AmStaff et du Staffordshire Bull Terrier. Racines bull-and-terrier; souvent affectueux, athlétiques et orientés humain si bien élevés. Exercice, socialisation, manières, propriétaire constant. Harnais solide; jamais chocolat, raisin, xylitol, oignon. La responsabilité compte plus que l’étiquette." },
  ];
  for (const b of breeds) {
    if (b.keys.some((k) => t.includes(k))) {
      return {
        reply: locale === "fr" ? b.fr : b.en,
        suggestions:
          locale === "fr"
            ? ["Éducation", "Alimentation", "Autre race"]
            : ["Training tips", "Diet & foods", "Another breed"],
      };
    }
  }
  if (/toxic|chocolat|xylitol|grape|raisin|onion|oignon|poison|aliment.*tox/.test(t)) {
    return {
      reply:
        locale === "fr"
          ? "Jamais: chocolat, xylitol, raisin, oignon, ail, avocat, alcool, café, os cuits. En cas d’ingestion, appelle un véto vite."
          : "Never: chocolate, xylitol, grapes/raisins, onions, garlic, avocado, alcohol, caffeine, cooked bones. Call a vet fast if ingested.",
      suggestions:
        locale === "fr" ? ["Friandises sûres", "Choisir une race"] : ["Safe treats", "Choosing a breed"],
    };
  }
  if (/train|éduc|puppy|chiot|leash|laisse|bark|aboie/.test(t)) {
    return {
      reply:
        locale === "fr"
          ? "Éducation: sessions courtes positives, laisse douce, socialisation, routine. Dis-moi l’âge et la race pour affiner."
          : "Training: short positive sessions, soft leash manners, socialization, routine. Tell me age + breed to tailor tips.",
      suggestions:
        locale === "fr" ? ["Socialisation", "Propreté"] : ["Socialization", "House training"],
    };
  }
  if (/choose|choisir|which breed|quelle race|apart|appartement|family|famille/.test(t)) {
    return {
      reply:
        locale === "fr"
          ? "Pour choisir: énergie, toilettage, taille, expérience, enfants, temps. Décris ton quotidien et je propose 3 pistes."
          : "To choose: energy, grooming, size, experience, kids, time. Describe your day and I’ll suggest 3 fits.",
      suggestions:
        locale === "fr" ? ["Appartement", "Premier chien"] : ["Apartment life", "First dog"],
    };
  }

  const doggy =
    /dog|chien|breed|race|puppy|chiot|canine|groom|toilet|train|éduc|walk|promenade|bark|aboie|leash|laisse|vet|véto|kibble|croquette|toxic|chocolat|xylitol|akc|fci|pitbull|pit bull|pittie|stafford|amstaff|staffy|bully|tell me about|parle[- ]moi|about the/.test(
      t
    );
  if (!doggy) {
    let reply;
    if (/cook|recipe|food|dinner|cuisine|dîner|pizza|coffee|café/.test(t)) {
      reply =
        locale === "fr"
          ? "Ça sent bon d’ici! Petite pensée canidé: chocolat, xylitol, raisin et oignon restent hors gamelle. Tu veux des friandises sûres, ou une race gourmande type Labrador?"
          : "That smells amazing from here! Quick paw-note: chocolate, xylitol, grapes, and onions stay out of the bowl. Want safe treats, or a food-motivated breed like the Labrador?";
    } else if (/travel|flight|avion|trip|voyage|hotel|vacance/.test(t)) {
      reply =
        locale === "fr"
          ? "Les valises donnent des papillons — aux chiens aussi. Tu pars avec un compagnon, ou tu veux des races plutôt globetrotteuses?"
          : "Suitcases give butterflies — dogs get them too. Traveling with a pup, or curious which breeds handle adventures best?";
    } else if (/movie|film|netflix|series|série|cinema|cinéma/.test(t)) {
      reply =
        locale === "fr"
          ? "Bon film! Ça me rappelle Lassie ou Hachi… Tu veux des races “stars”, ou une vraie fiche race?"
          : "Movie night vibes! Makes me think of Lassie or Hachi… Want famous film-dog breeds, or a real breed deep-dive?";
    } else if (/sport|gym|run|foot|soccer|basket|workout|sportif/.test(t)) {
      reply =
        locale === "fr"
          ? "Cette énergie mériterait un partenaire d’agility! Border Collie, ou plutôt sieste après deux balles?"
          : "That energy deserves an agility buddy! Border Collie athlete, or a nap-after-two-balls companion?";
    } else {
      reply =
        locale === "fr"
          ? "Hmm, ça ouvre plein d’images — quel chien collerait à cette vibe: sportif, câlin d’appart, ou cœur de maison?"
          : "Hmm, that paints a picture — which dog matches that vibe: curious athlete, apartment cuddler, or heart-of-the-home?";
    }
    return {
      reply,
      suggestions:
        locale === "fr"
          ? ["Races populaires", "Choisir une race", "Éducation chiot"]
          : ["Popular breeds", "Choosing a breed", "Puppy training"],
    };
  }

  return {
    reply:
      locale === "fr"
        ? "Je suis Dooogs! — parle-moi d’une race, d’éducation, d’alimentation ou de comportement, et je t’aide."
        : "I’m Dooogs! — ask about a breed, training, food, or behavior and I’ll help.",
    suggestions:
      locale === "fr"
        ? ["Caniche", "Aliments toxiques", "Choisir une race"]
        : ["Poodles", "Toxic foods", "Help me choose"],
  };
}

function defaultSuggestions(locale) {
  return locale === "fr"
    ? ["En savoir plus", "Autre race", "Éducation"]
    : ["Tell me more", "Another breed", "Training tips"];
}

function breedContextFor(text, locale) {
  const t = (text || "").toLowerCase();
  const breeds = [
    { keys: ["pitbull", "pit bull", "pittie", "amstaff", "stafford", "staffy", "bully"], en: "Pit bull–type / bully breeds: APBT, AmStaff, Staffy — athletic, people-oriented when raised well; need exercise, socialization, consistent ownership.", fr: "Types pit bull / bully: APBT, AmStaff, Staffy — athlétiques, orientés humain si bien élevés; exercice, socialisation, cadre constant." },
    { keys: ["poodle", "caniche"], en: "Poodles: brilliant water dogs, curly low-shed coat, high trainability, need grooming + brain games.", fr: "Caniche: chien d’eau brillant, poil bouclé, très éducable, toilettage + jeux mentaux." },
    { keys: ["labrador", "lab "], en: "Labrador: friendly gundog, high energy, food-motivated, watch weight.", fr: "Labrador: chien de rapport amical, énergivore, motivé nourriture, attention poids." },
    { keys: ["german shepherd", "berger allemand", "gsd"], en: "German Shepherd: versatile working dog; needs structure, training, serious exercise.", fr: "Berger allemand: chien de travail polyvalent; structure, éducation, gros exercice." },
    { keys: ["golden"], en: "Golden Retriever: warm gundog, soft mouth, needs a job + grooming.", fr: "Golden: chien de rapport chaleureux, besoin d’un job + toilettage." },
    { keys: ["border collie", "border"], en: "Border Collie: elite herding athlete; needs a real job or invents chaos.", fr: "Border Collie: athlète de troupeau; il lui faut un vrai job." },
    { keys: ["husky", "siberian"], en: "Siberian Husky: endurance sled dog; serious exercise, secure fencing, heat-sensitive.", fr: "Husky: chien de traîneau d’endurance; gros exercice, clôture, sensible à la chaleur." },
    { keys: ["french bulldog", "frenchie", "bouledogue"], en: "French Bulldog: compact companion; mind heat and breathing; moderate walks.", fr: "Bouledogue français: compagnon compact; attention chaleur/respiration." },
    { keys: ["beagle"], en: "Beagle: scent hound, nose-driven, vocal; needs sniff walks + secure fence.", fr: "Beagle: chien courant, mené par le nez; balades snif + jardin sécurisé." },
    { keys: ["dachshund", "teckel", "doxie"], en: "Dachshund: bold long-backed; protect the spine, watch weight.", fr: "Teckel: audacieux, dos long; protéger le dos, attention poids." },
    { keys: ["corgi"], en: "Corgi: short-legged herder, big personality; watch weight (long back).", fr: "Corgi: troupeau bas sur pattes; attention poids." },
    { keys: ["rottweiler", "rott"], en: "Rottweiler: powerful working dog; early socialization + clear leadership.", fr: "Rottweiler: chien de travail puissant; socialisation précoce + cadre clair." },
    { keys: ["aussie", "australian shepherd"], en: "Australian Shepherd: energetic herder; needs a job (agility/herding).", fr: "Australian Shepherd: troupeau énergique; besoin d’un job." },
  ];
  for (const b of breeds) {
    if (b.keys.some((k) => t.includes(k))) return locale === "fr" ? b.fr : b.en;
  }
  return "";
}

function buildSystem(locale, lastUser, extraContext) {
  const hint = breedContextFor(lastUser, locale);
  const breedBlock = hint
    ? locale === "fr"
      ? `\n\nCONTEXTE RACE (faits à utiliser):\n${hint}`
      : `\n\nBREED CONTEXT (use these facts):\n${hint}`
    : "";
  const ragBlock = extraContext
    ? locale === "fr"
      ? `\n\nCONNAISSANCES RÉCUPÉRÉES (source de vérité — base-toi dessus):\n${String(extraContext).slice(0, 1200)}`
      : `\n\nRETRIEVED KNOWLEDGE (source of truth — ground your answer here):\n${String(extraContext).slice(0, 1200)}`
    : "";
  return `${dogExpertSystemPrompt(locale)}${breedBlock}${ragBlock}\n\n${suggestionSystemExtra(locale)}`;
}

async function chatViaOllama(cleaned, locale, env, extraContext) {
  const base = (env.OLLAMA_BASE_URL || DEFAULT_OLLAMA_BASE_URL || "")
    .trim()
    .replace(/\/+$/, "");
  if (!base) return null;

  const model = (env.OLLAMA_CHAT_MODEL || DEFAULT_OLLAMA_MODEL || "llama3.1:8b").trim();
  const lastUser = cleaned[cleaned.length - 1]?.content || "";
  const system = buildSystem(locale, lastUser, extraContext);
  const upstream = await fetch(`${base}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: 0.45,
      max_tokens: 550,
      messages: [{ role: "system", content: system }, ...cleaned],
    }),
  });
  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => "");
    throw new Error(`ollama_${upstream.status}:${detail.slice(0, 120)}`);
  }
  const data = await upstream.json();
  const raw = data.choices?.[0]?.message?.content?.trim() || "";
  if (!raw) throw new Error("ollama_empty");
  const parsed = parseReplyAndSuggestions(raw);
  return {
    reply: parsed.reply,
    suggestions: parsed.suggestions.length ? parsed.suggestions : defaultSuggestions(locale),
    source: `ollama:${model}`,
  };
}

/** Free cloud LLM — no key (Pollinations OpenAI-compatible). */
async function chatViaFreeLlm(cleaned, locale, extraContext) {
  const lastUser = cleaned[cleaned.length - 1]?.content || "";
  const system = buildSystem(locale, lastUser, extraContext);
  const upstream = await fetch("https://text.pollinations.ai/openai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "openai",
      temperature: 0.5,
      max_tokens: 700,
      messages: [{ role: "system", content: system }, ...cleaned.slice(-16)],
    }),
  });
  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => "");
    throw new Error(`free_llm_${upstream.status}:${detail.slice(0, 80)}`);
  }
  const data = await upstream.json();
  const raw = data.choices?.[0]?.message?.content?.trim() || "";
  if (!raw) throw new Error("free_llm_empty");
  const parsed = parseReplyAndSuggestions(raw);
  return {
    reply: parsed.reply,
    suggestions: parsed.suggestions.length ? parsed.suggestions : defaultSuggestions(locale),
    source: "free-llm:pollinations",
  };
}

async function chatViaWorkersAI(cleaned, locale, env, extraContext) {
  if (!env.AI) throw new Error("workers_ai_missing");

  const lastUser = cleaned[cleaned.length - 1]?.content || "";
  const system = buildSystem(locale, lastUser, extraContext);
  const errors = [];

  for (const model of WORKERS_AI_MODELS) {
    try {
      const result = await env.AI.run(model, {
        messages: [{ role: "system", content: system }, ...cleaned],
        max_tokens: 550,
        temperature: 0.45,
      });

      const raw =
        (typeof result === "string" ? result : result?.response || result?.result?.response || "")
          .toString()
          .trim();
      if (!raw) {
        errors.push(`${model}:empty`);
        continue;
      }

      const parsed = parseReplyAndSuggestions(raw);
      return {
        reply: parsed.reply,
        suggestions: parsed.suggestions.length ? parsed.suggestions : defaultSuggestions(locale),
        source: `workers-ai:${model}`,
      };
    } catch (err) {
      errors.push(`${model}:${err instanceof Error ? err.message.slice(0, 120) : "fail"}`);
    }
  }

  throw new Error(errors.join(" | ").slice(0, 280) || "workers_ai_failed");
}

async function handleChat(req, env) {
  let body;
  try {
    body = await req.json();
  } catch {
    return json(req, { error: "invalid_json" }, 400);
  }

  const locale = body.locale === "fr" ? "fr" : "en";
  const incoming = Array.isArray(body.messages) ? body.messages : [];
  const cleaned = incoming
    .filter(
      (m) =>
        m &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.trim()
    )
    .map((m) => ({
      role: m.role,
      content: m.content.replace(/\s+/g, " ").trim().slice(0, 4000),
    }))
    .slice(-24);

  if (!cleaned.length || cleaned[cleaned.length - 1]?.role !== "user") {
    return json(req, { error: "need_user_message" }, 400);
  }

  const lastUser = cleaned[cleaned.length - 1].content;
  const extraContext =
    typeof body.context === "string" && body.context.trim()
      ? body.context.trim().slice(0, 1200)
      : "";

  function isWeak(reply) {
    const r = String(reply || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (r.length < 120) return true;
    if (
      /paints a picture|which dog would match|match that vibe|ça ouvre plein d’images|quelle race collerait|More on this breed day-to-day/i.test(
        r
      )
    ) {
      return true;
    }
    return false;
  }

  const errors = [];
  try {
    // Primary: Workers AI (when available on a claimed Cloudflare account)
    try {
      const ai = await chatViaWorkersAI(cleaned, locale, env, extraContext);
      if (ai?.reply && !isWeak(ai.reply)) return json(req, ai);
      if (ai?.reply) return json(req, ai);
      errors.push("workers_ai_weak_or_empty");
    } catch (err) {
      errors.push(err instanceof Error ? err.message.slice(0, 180) : "workers_ai_failed");
    }

    // Free cloud LLM (no key) — works on temporary Workers too
    try {
      const free = await chatViaFreeLlm(cleaned, locale, extraContext);
      if (free?.reply && !isWeak(free.reply)) return json(req, free);
      if (free?.reply) return json(req, free);
      errors.push("free_llm_weak_or_empty");
    } catch (err) {
      errors.push(err instanceof Error ? err.message.slice(0, 180) : "free_llm_failed");
    }

    // Optional Ollama if configured
    try {
      const ollama = await chatViaOllama(cleaned, locale, env, extraContext);
      if (ollama?.reply && !isWeak(ollama.reply)) return json(req, ollama);
      if (ollama?.reply) return json(req, ollama);
      if (env.OLLAMA_BASE_URL) errors.push("ollama_weak_or_empty");
    } catch (err) {
      errors.push(err instanceof Error ? err.message.slice(0, 180) : "ollama_failed");
    }

    const offline = offlineDogReply(lastUser, locale);
    return json(req, { ...offline, source: "offline_fallback", detail: errors.join(" | ").slice(0, 300) });
  } catch (err) {
    const offline = offlineDogReply(lastUser, locale);
    return json(req, {
      ...offline,
      source: "offline_fallback",
      detail: err instanceof Error ? err.message.slice(0, 200) : "chat_failed",
    });
  }
}

async function handleStt(req, env) {
  if (!env.AI) return json(req, { error: "stt_unavailable" }, 503);

  let locale = "en";
  let bytes;
  try {
    const ct = req.headers.get("content-type") || "";
    if (ct.includes("multipart/form-data")) {
      const form = await req.formData();
      locale = form.get("locale") === "fr" ? "fr" : "en";
      const file = form.get("audio");
      if (!file || typeof file === "string") {
        return json(req, { error: "missing_audio" }, 400);
      }
      bytes = new Uint8Array(await file.arrayBuffer());
    } else {
      bytes = new Uint8Array(await req.arrayBuffer());
    }
  } catch {
    return json(req, { error: "invalid_audio" }, 400);
  }

  if (!bytes?.length || bytes.length < 400) {
    return json(req, { error: "audio_too_short" }, 400);
  }
  // Cap ~2MB
  if (bytes.length > 2_000_000) {
    return json(req, { error: "audio_too_large" }, 413);
  }

  try {
    const result = await env.AI.run(WHISPER_MODEL, {
      audio: [...bytes],
    });
    const text = String(
      result?.text || result?.result?.text || result?.transcription || ""
    )
      .replace(/\s+/g, " ")
      .trim();
    if (!text) return json(req, { error: "empty_transcript" }, 422);
    return json(req, { text, locale, source: `whisper:${WHISPER_MODEL}` });
  } catch (err) {
    return json(
      req,
      {
        error: "stt_failed",
        detail: err instanceof Error ? err.message.slice(0, 200) : "unknown",
      },
      502
    );
  }
}

async function handleTts(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return json(req, { error: "invalid_json" }, 400);
  }

  const text = (body.text ?? "").replace(/\s+/g, " ").trim().slice(0, 1800);
  if (!text) return json(req, { error: "empty_text" }, 400);
  const locale = body.locale === "fr" ? "fr" : "en";
  const cacheKey = `${locale}:${text}`;

  try {
    let audio = ttsCache.get(cacheKey);
    if (!audio) {
      audio = await synthesizeSharedTts(text, locale);
      if (ttsCache.size >= TTS_CACHE_MAX) {
        const first = ttsCache.keys().next().value;
        ttsCache.delete(first);
      }
      ttsCache.set(cacheKey, audio);
    }
    return new Response(audio, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "private, max-age=3600",
        ...corsHeaders(req),
      },
    });
  } catch (err) {
    return json(
      req,
      {
        error: "tts_failed",
        detail: err instanceof Error ? err.message.slice(0, 200) : "unknown",
      },
      502
    );
  }
}

function splitTtsChunks(text, maxLen = 160) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const sentences = clean.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((s) => s.trim()) ?? [clean];
  const out = [];
  let buf = "";
  for (const s of sentences) {
    if ((buf + " " + s).trim().length <= maxLen) {
      buf = (buf + " " + s).trim();
    } else {
      if (buf) out.push(buf);
      if (s.length <= maxLen) buf = s;
      else {
        for (let i = 0; i < s.length; i += maxLen) out.push(s.slice(i, i + maxLen));
        buf = "";
      }
    }
  }
  if (buf) out.push(buf);
  return out;
}

/** Shared free TTS — same audio on mobile and desktop. */
async function synthesizeSharedTts(text, locale) {
  const chunks = splitTtsChunks(text);
  if (!chunks.length) throw new Error("empty_text");
  // Unify language tag (same voice on every device)
  const tl = locale === "fr" ? "fr" : "en";
  const parts = [];
  for (const chunk of chunks) {
    const url =
      `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${tl}` +
      `&q=${encodeURIComponent(chunk)}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Accept: "*/*",
        Referer: "https://translate.google.com/",
      },
    });
    if (!res.ok) throw new Error(`tts_http_${res.status}`);
    const buf = new Uint8Array(await res.arrayBuffer());
    if (!buf.length) throw new Error("tts_empty");
    parts.push(buf);
    await new Promise((r) => setTimeout(r, 40));
  }
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out.buffer;
}

export default {
  async fetch(req, env) {
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(req) });
    }

    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    if (req.method === "GET" && (path === "/" || path === "/health")) {
      return json(req, {
        ok: true,
        service: "dooogs-api",
        chat: "workers-ai+free-llm+ollama",
        stt: WHISPER_MODEL,
        tts: "shared-google",
        model: WORKERS_AI_MODEL,
      });
    }

    if (req.method === "POST" && (path === "/api/chat" || path === "/chat")) {
      return handleChat(req, env);
    }
    if (req.method === "POST" && (path === "/api/tts" || path === "/tts")) {
      return handleTts(req);
    }
    if (req.method === "POST" && (path === "/api/stt" || path === "/stt")) {
      return handleStt(req, env);
    }

    return json(req, { error: "not_found", path }, 404);
  },
};
