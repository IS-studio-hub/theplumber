type Msg = { role: "user" | "assistant"; content: string };

type OfflineResult = {
  reply: string;
  suggestions: string[];
};

const BREEDS: Record<
  string,
  { en: string; fr: string; keys: string[] }
> = {
  poodle: {
    keys: ["poodle", "caniche"],
    en: `Poodles (Standard, Miniature, Toy) are brilliant, athletic water dogs with curly low-shed coats that need regular grooming.<br><br>History traces to German water retrieving (Pudel ≈ “to splash”), later beloved in France. They’re common across Europe and North America.<br><br>Personality: eager, trainable, people-oriented. They thrive with daily exercise and brain games. Avoid fatty table scraps; never chocolate, grapes, xylitol, or onions.<br><br>See more at AKC Poodle pages, Poodle Club of America events, and local specialty shows.`,
    fr: `Les caniches (Standard, Nain, Toy) sont des chiens d’eau brillants et sportifs, au poil bouclé peu sujet à la mue, qui demandent un toilettage régulier.<br><br>Histoire liée au rapport à l’eau en Allemagne (Pudel), puis très aimés en France. Courants en Europe et en Amérique du Nord.<br><br>Caractère: vif, éducable, proche des humains. Besoin d’exercice et de jeux mentaux. Évite les restes gras; jamais chocolat, raisin, xylitol ou oignon.<br><br>Pour en voir plus: fiches AKC, clubs de race, expositions spécialisées.`,
  },
  labrador: {
    keys: ["labrador", "lab "],
    en: `Labrador Retrievers are friendly, food-motivated gundogs with a water-loving double coat and an otter tail.<br><br>They descend from Newfoundland’s St. John’s water dogs, refined in Britain for retrieving. They’re among the world’s most common family and service dogs.<br><br>Expect high energy, soft mouths, and a need for training plus daily walks. Watch weight — Labs love food. Never chocolate, grapes, xylitol, or cooked bones.<br><br>See them at hunt tests, field trials, dock diving, and Labrador club events.`,
    fr: `Le Labrador est un chien de rapport amical, motivé par la nourriture, avec un poil double aimant l’eau et une queue en loutre.<br><br>Il descend des chiens d’eau de St. John’s (Terre-Neuve), affiné en Grande-Bretagne. Parmi les chiens de famille et d’assistance les plus répandus.<br><br>Beaucoup d’énergie, gueule douce, besoin d’éducation et de marches. Attention au poids. Jamais chocolat, raisin, xylitol ou os cuits.<br><br>À voir: field trials, dock diving, clubs Labrador.`,
  },
  shepherd: {
    keys: ["german shepherd", "berger allemand", "gsd"],
    en: `German Shepherds are loyal, versatile working dogs — herding roots with huge roles in police, sport, and service work.<br><br>Standardized in Germany by Max von Stephanitz around 1899; now common worldwide.<br><br>They need structure, training, and serious mental + physical exercise. Socialize early. Diet should match activity; avoid toxic human foods (chocolate, xylitol, grapes).<br><br>See GSD club trials, IPO/IGP sport, herding demos, and AKC specialty shows.`,
    fr: `Le berger allemand est un chien de travail loyal et polyvalent — racines de troupeau, rôles en police, sport et assistance.<br><br>Standardisé en Allemagne par Max von Stephanitz vers 1899; répandu dans le monde.<br><br>Il lui faut structure, éducation, exercice physique et mental. Socialise tôt. Alimentation adaptée à l’activité; évite chocolat, xylitol, raisin.<br><br>À voir: clubs GSD, sport IPO/IGP, démos de troupeau, expos.`,
  },
  golden: {
    keys: ["golden retriever", "golden"],
    en: `Golden Retrievers are warm, eager gundogs with soft mouths and people-loving hearts.<br><br>Bred in 19th-century Scotland for waterfowl retrieving; popular across the UK, North America, and beyond.<br><br>They need grooming, exercise, and jobs (therapy, field, sports). Watch ears and weight. Never chocolate, grapes, xylitol, or onions.<br><br>Find them at hunt tests, obedience, therapy demos, and Golden Retriever club events.`,
    fr: `Le Golden Retriever est un chien de rapport chaleureux, gueule douce, très proche des humains.<br><br>Développé en Écosse au XIXe pour la sauvagine; populaire au Royaume-Uni, en Amérique du Nord et ailleurs.<br><br>Toilettage, exercice et « job » (thérapie, field, sports). Attention oreilles et poids. Jamais chocolat, raisin, xylitol, oignon.<br><br>Hunt tests, obéissance, clubs Golden.`,
  },
  frenchie: {
    keys: ["french bulldog", "frenchie", "bouledogue français", "bouledogue francais"],
    en: `French Bulldogs are compact companion dogs with bat ears and big personalities — apartment-friendly, not marathon runners.<br><br>Toy bulldogs from England became Paris café companions in the 1800s; now globally popular.<br><br>Mind heat and breathing (brachycephalic). Keep walks moderate; use harnesses. Avoid obesity and toxic foods.<br><br>See companion shows and French Bulldog club gatherings; choose health-tested breeders.`,
    fr: `Le bouledogue français est un compagnon compact aux oreilles de chauve-souris — idéal en appart, pas fait pour le marathon.<br><br>Des toy bulldogs anglais sont devenus mascottes des cafés parisiens au XIXe; très populaires aujourd’hui.<br><br>Attention chaleur et respiration. Marches modérées, harnais. Évite surpoids et aliments toxiques.<br><br>Expos compagnons et clubs; choisis des éleveurs qui testent la santé.`,
  },
  beagle: {
    keys: ["beagle"],
    en: `Beagles are merry scent hounds — nose-driven, curious, and vocal with that classic bay.<br><br>British hare-hunting roots; common as pets and detection dogs worldwide.<br><br>They need sniff walks and secure fencing. Food-motivated and prone to weight gain. No chocolate, grapes, or xylitol.<br><br>See hound shows, pack events, scent work, and National Beagle Club resources.`,
    fr: `Le Beagle est un chien courant joyeux — mené par le nez, curieux, avec sa voix typique.<br><br>Racines de chasse au lièvre en Grande-Bretagne; compagnon et chien de détection dans le monde.<br><br>Balades « snif », jardin sécurisé. Motivé par la nourriture, attention au poids. Pas de chocolat, raisin, xylitol.<br><br>Expos Hound, meutes, clubs Beagle.`,
  },
  collie: {
    keys: [
      "border collie",
      "border coli",
      "rough collie",
      "smooth collie",
      "scotch collie",
      "collie",
      "collies",
      "coli",
      "colie",
      "colly",
      "colies",
    ],
    en: `Collies — especially the Border Collie — are elite herding athletes with intense focus, stare, and drive. “Collie” can also mean the longer-coated Rough Collie (the classic Lassie look) or the Smooth Collie.<br><br>Border Collies were bred on the England–Scotland border for sheep; Rough/Smooth Collies share herding roots and are famous as loyal family companions.<br><br>Border Collies need a real job (herding, agility, advanced training) or they invent chaos. Rough Collies still want daily walks and mental work, with regular coat care.<br><br>Watch sheepdog trials, herding clinics, and Collie / Border Collie club events. Never chocolate, grapes, xylitol, or onions.`,
    fr: `Les Collies — surtout le Border Collie — sont des athlètes de troupeau au focus intense. « Collie » peut aussi désigner le Rough Collie (look Lassie) ou le Smooth Collie.<br><br>Le Border Collie vient de la frontière anglo-écossaise; les Rough/Smooth ont aussi des racines de conduite et sont de fidèles compagnons.<br><br>Le Border a besoin d’un vrai job (troupeau, agility, éducation avancée) sinon: chaos. Le Rough veut marches + stimulation, et un toilettage régulier.<br><br>Sheepdog trials, clubs Collie / Border Collie. Jamais chocolat, raisin, xylitol, oignon.`,
  },
  dachshund: {
    keys: ["dachshund", "teckel", "wiener", "doxie"],
    en: `Dachshunds are bold badger dogs in a long, low frame — curious and courageous.<br><br>German earth-dog history (“Dachs” + “Hund”); popular companions worldwide in smooth, long, and wire coats.<br><br>Protect the back (ramps, no big jumps). Short walks plus sniff games. Watch weight. Never toxic foods like chocolate or xylitol.<br><br>See earthdog tests, dachshund specialties, and club meetups.`,
    fr: `Le teckel est un chasseur de blaireau audacieux, long et bas — curieux et courageux.<br><br>Histoire allemande de chien de terrier; compagnon mondial (poil ras, long, dur).<br><br>Protège le dos (rampes, pas de grands sauts). Petites marches + jeux de nez. Attention poids. Jamais chocolat ou xylitol.<br><br>Tests earthdog, spécialités teckel, clubs.`,
  },
  husky: {
    keys: ["husky", "siberian"],
    en: `Siberian Huskies are endurance sled dogs — athletic, independent, and famously vocal.<br><br>Bred by the Chukchi people of Siberia; now popular worldwide as active companions.<br><br>They need serious exercise, secure fencing, and mental work. Thick coats dislike extreme heat. Never toxic human foods.<br><br>See sled demos, husky club events, and Nordic breed shows.`,
    fr: `Le Husky sibérien est un chien de traîneau d’endurance — athlétique, indépendant, très expressif.<br><br>Sélectionné par les Tchouktches en Sibérie; compagnon actif dans le monde.<br><br>Beaucoup d’exercice, clôture solide, stimulation mentale. Attention à la chaleur. Jamais d’aliments toxiques.<br><br>Démos de traîneau, clubs husky, expos nordiques.`,
  },
  shiba: {
    keys: ["shiba", "shiba inu"],
    en: `Shiba Inu are compact Japanese spitz dogs — bold, clean, and often cat-like independent.<br><br>Ancient Japan hunting roots; now a global companion icon.<br><br>Early socialization and leash manners matter. They shed (“blowing coat”). Watch escape artists. Avoid toxic foods.<br><br>See Japanese breed clubs, companion shows, and Shiba specialty events.`,
    fr: `Le Shiba Inu est un spitz japonais compact — audacieux, propre, parfois indépendant comme un chat.<br><br>Racines de chasse au Japon; compagnon mondial.<br><br>Socialisation et laisse tôt. Mue saisonnière. Attention aux fugues. Évite aliments toxiques.<br><br>Clubs japonais, expos compagnons, spécialités Shiba.`,
  },
  bulldog: {
    keys: ["english bulldog", "bulldog"],
    en: `English Bulldogs are sturdy companion dogs with a distinctive pushed-in face and easygoing vibe indoors.<br><br>British history from bull-baiting to gentle family icons.<br><br>Mind heat, breathing, and weight. Short walks; avoid overexertion. Choose health-focused breeders. No toxic table foods.<br><br>See bulldog clubs and companion specialty shows.`,
    fr: `Le Bulldog anglais est un compagnon solide au museau court, calme à la maison.<br><br>Histoire britannique, d’abord combat puis famille.<br><br>Attention chaleur, respiration et poids. Petites marches. Éleveurs sérieux sur la santé. Pas d’aliments toxiques.<br><br>Clubs bulldog et expos compagnons.`,
  },
  yorkie: {
    keys: ["yorkshire", "yorkie"],
    en: `Yorkshire Terriers are tiny, confident toy terriers with a silky coat and big-dog attitude.<br><br>19th-century England (textile mills); now worldwide lap and show companions.<br><br>Dental care, gentle handling, and coat upkeep matter. Watch stairs and bigger dogs. Never chocolate or xylitol.<br><br>See toy group shows and Yorkie club events.`,
    fr: `Le Yorkshire est un toy terrier confiant, poil soyeux, caractère bien trempé.<br><br>Angleterre du XIXe (usines textiles); compagnon mondial.<br><br>Soins dentaires, manipulation douce, toilettage. Attention escaliers. Jamais chocolat ou xylitol.<br><br>Expos toy et clubs Yorkie.`,
  },
  boxer: {
    keys: ["boxer"],
    en: `Boxers are bouncy working dogs — playful, loyal, and expressive with that square muzzle.<br><br>German roots (Bullensbeisser crosses); popular family and service dogs worldwide.<br><br>They need training and daily exercise. Short coats feel cold; watch heat too. No toxic human foods.<br><br>See obedience, agility, and Boxer club specialties.`,
    fr: `Le Boxer est un chien de travail joueur et loyal, museau carré très expressif.<br><br>Racines allemandes; famille et service dans le monde.<br><br>Éducation et exercice quotidiens. Poil court: froid et chaleur. Pas d’aliments toxiques.<br><br>Obéissance, agility, clubs Boxer.`,
  },
  rottweiler: {
    keys: ["rottweiler", "rott"],
    en: `Rottweilers are powerful, confident working dogs — historically drovers and guardians.<br><br>From Rottweil, Germany; now worldwide for family, sport, and protection work with proper training.<br><br>Need early socialization, clear leadership, and exercise. Responsible ownership matters. Avoid toxic foods.<br><br>See working trials, IGP sport, and Rottweiler club events.`,
    fr: `Le Rottweiler est un chien de travail puissant et sûr de lui — bouvier et gardien.<br><br>De Rottweil (Allemagne); famille, sport et protection avec une bonne éducation.<br><br>Socialisation précoce, cadre clair, exercice. Responsabilité de l’humain. Évite aliments toxiques.<br><br>Trials, sport IGP, clubs Rottweiler.`,
  },
  australian: {
    keys: ["australian shepherd", "aussie"],
    en: `Australian Shepherds are energetic herding dogs — bright, agile, and often patterned with merle coats.<br><br>Despite the name, developed in the US for ranch work; popular in dog sports worldwide.<br><br>They need a job (agility, herding, advanced training). Underworked Aussies invent trouble. No toxic foods.<br><br>See herding trials, agility, and Aussie club events.`,
    fr: `L’Australian Shepherd est un chien de troupeau énergique — vif, agile, souvent merle.<br><br>Malgré le nom, développé aux USA pour les ranchs; star des sports canins.<br><br>Il lui faut un job (agility, troupeau, éducation). Sans ça: bêtises. Pas d’aliments toxiques.<br><br>Trials, agility, clubs Aussie.`,
  },
  corgi: {
    keys: ["corgi", "pembroke", "cardigan"],
    en: `Corgis (Pembroke & Cardigan) are short-legged herding dogs — bold, bright, and big on personality.<br><br>Welsh cattle dogs; Pembroke famously linked to British royalty; popular worldwide.<br><br>Watch weight (long backs). Mental work plus walks. Never toxic foods like chocolate or xylitol.<br><br>See herding events, companion shows, and corgi club meetups.`,
    fr: `Le Corgi (Pembroke & Cardigan) est un chien de troupeau bas sur pattes — audacieux et malin.<br><br>Bouvier gallois; le Pembroke lié à la royauté britannique; populaire partout.<br><br>Attention au poids (dos long). Marches + stimulation. Jamais chocolat ou xylitol.<br><br>Troupeau, expos, clubs corgi.`,
  },
  maltese: {
    keys: ["maltese"],
    en: `Maltese are tiny companion dogs with flowing white coats and affectionate temperaments.<br><br>Ancient Mediterranean lapdog history; beloved show and companion dogs worldwide.<br><br>Daily coat care, dental health, and gentle exercise. Avoid rough play with big dogs. No toxic foods.<br><br>See toy shows and Maltese club specialties.`,
    fr: `Le Bichon maltais est un tout petit compagnon au long poil blanc, très affectueux.<br><br>Histoire méditerranéenne ancienne; expos et compagnonnage mondiaux.<br><br>Toilettage, dents, exercice doux. Évite jeux brutaux. Pas d’aliments toxiques.<br><br>Expos toy et clubs maltais.`,
  },
  akita: {
    keys: ["akita"],
    en: `Akitas are large Japanese spitz dogs — dignified, loyal, and powerful.<br><br>From northern Japan; symbols of loyalty (Hachikō). Two related types: Japanese Akita and American Akita lines.<br><br>Need experienced handling, socialization, and space. Thick coat; seasonal shed. Avoid toxic foods.<br><br>See Akita clubs, companion specialties, and cultural breed events.`,
    fr: `L’Akita est un grand spitz japonais — digne, loyal, puissant.<br><br>Nord du Japon; symbole de loyauté (Hachikō). Lignes japonaise et américaine.<br><br>Main experte, socialisation, espace. Poil dense, mue. Évite aliments toxiques.<br><br>Clubs Akita et expos.`,
  },
  pitbull: {
    keys: [
      "pitbull",
      "pit bull",
      "pit-bull",
      "pittie",
      "pitty",
      "american pit bull",
      "amstaff",
      "american staffordshire",
      "staffordshire bull",
      "staffy",
      "staffie",
      "bully breed",
    ],
    en: `Oh, pit bulls — great question. “Pit bull” usually means a family of strong, muscular bully-type dogs, most often the American Pit Bull Terrier, plus close cousins like the American Staffordshire Terrier and Staffordshire Bull Terrier.<br><br>They come from old bull-and-terrier roots. Raised well, a lot of them are affectionate, goofy, and deeply people-oriented. They need daily exercise, early socialization, clear manners, and a calm, consistent human.<br><br>Use a sturdy harness on walks — they’re strong. Skip chocolate, grapes, xylitol, and onions. And honestly? Training and responsible ownership matter way more than the label.<br><br>Want training tips, apartment life notes, or how AmStaff and Staffy differ?`,
    fr: `Ah, les pit bulls — super question. « Pit bull » désigne surtout une famille de chiens bully musclés, souvent l’American Pit Bull Terrier, proches de l’American Staffordshire et du Staffordshire Bull Terrier.<br><br>Racines bull-and-terrier. Bien élevés, beaucoup sont affectueux, joueurs et très orientés vers l’humain. Il leur faut de l’exercice, une socialisation précoce, de bonnes manières, et quelqu’un de calme et constant.<br><br>Harnais solide en laisse — ils ont de la force. Pas de chocolat, raisin, xylitol, oignon. Et franchement: l’éducation compte plus que l’étiquette.<br><br>Tu veux des tips d’éducation, la vie en appart, ou les différences AmStaff / Staffy?`,
  },
  chihuahua: {
    keys: ["chihuahua"],
    en: `Chihuahuas are tiny, alert companions with outsized personalities — apple or deer heads, big eyes, big opinions.<br><br>Mexican origins; among the world’s smallest dog breeds; popular apartment companions everywhere.<br><br>Mind cold, dental care, and gentle handling. They can be territorial — early socialization helps. Never toxic foods.<br><br>See toy-group shows and Chihuahua club events.`,
    fr: `Le Chihuahua est un tout petit compagnon très expressif — tête pomme ou cerf, grands yeux, grand caractère.<br><br>Origines mexicaines; parmi les plus petites races; idéal en appart.<br><br>Attention froid, dents, manipulation douce. Socialisation tôt. Pas d’aliments toxiques.<br><br>Expos toy et clubs Chihuahua.`,
  },
  malinois: {
    keys: ["malinois", "belgian malinois", "mali"],
    en: `Belgian Malinois are intense working athletes — sharp, driven, and built for protection, sport, and detection work.<br><br>Belgian herding roots; common in police/military and high-level dog sport worldwide.<br><br>Not a casual first dog: they need expert handling, heavy exercise, and a real job. Avoid underwork. No toxic human foods.<br><br>See IGP/PSA sport, detection demos, and Malinois clubs.`,
    fr: `Le Malinois belge est un athlète de travail intense — vif, drive élevé, fait pour protection, sport et détection.<br><br>Racines de berger belge; police/armée et sport canin mondial.<br><br>Pas un premier chien “facile”: main experte, gros exercice, vrai job. Pas d’aliments toxiques.<br><br>Sport IGP/PSA, clubs Malinois.`,
  },
  dane: {
    keys: ["great dane", "dane", "dogue allemand"],
    en: `Great Danes are gentle giants — tall, affectionate, and surprisingly soft indoors when well exercised.<br><br>German “Deutsche Dogge” history; worldwide family and show companions.<br><br>Need space, joint-aware exercise (especially as puppies), and portion control. Short coats feel cold. Never toxic foods.<br><br>See giant-breed shows and Great Dane club specialties.`,
    fr: `Le Dogue allemand est un géant doux — grand, affectueux, souvent calme à la maison s’il est bien sorti.<br><br>Histoire allemande; famille et expos mondiales.<br><br>Espace, exercice respectueux des articulations (chiot!), portions. Poil court: froid. Pas d’aliments toxiques.<br><br>Expos géants et clubs.`,
  },
  newfoundland: {
    keys: ["newfoundland", "newfie", "terre-neuve", "terre neuve"],
    en: `Newfoundlands are massive water-rescue dogs — sweet, patient, and famously gentle with families.<br><br>Canadian maritime roots; strong swimmers with a water-resistant coat.<br><br>Need room, grooming for heavy coats, and joint-aware care. Watch heat. Never toxic foods.<br><br>See water-rescue demos and Newfoundland club events.`,
    fr: `Le Terre-Neuve est un grand sauveteur aquatique — doux, patient, fabuleux avec les familles.<br><br>Racines maritimes canadiennes; excellent nageur, poil résistant à l’eau.<br><br>Espace, toilettage, articulations, attention chaleur. Pas d’aliments toxiques.<br><br>Démos de sauvetage et clubs.`,
  },
  bernese: {
    keys: ["bernese", "berner", "bouvier bernois"],
    en: `Bernese Mountain Dogs are tri-colored Swiss farm dogs — loyal, calm, and people-oriented.<br><br>From the Bern region; draft and droving history; popular family companions.<br><br>Heavy coat needs brushing; moderate exercise; watch joints and heat. Choose health-focused breeders. No toxic foods.<br><br>See draft tests and Bernese club gatherings.`,
    fr: `Le Bouvier bernois est un chien de ferme suisse tricolore — loyal, calme, proche des humains.<br><br>Régions près de Berne; trait et conduite; compagnon familial.<br><br>Poil dense à brosser, exercice modéré, articulations et chaleur. Éleveurs sérieux. Pas d’aliments toxiques.<br><br>Tests de trait et clubs.`,
  },
  cavalier: {
    keys: ["cavalier", "cavalier king charles"],
    en: `Cavalier King Charles Spaniels are affectionate toy spaniels — soft eyes, silky ears, lap-loving hearts.<br><br>British companion history; popular worldwide as gentle family dogs.<br><br>Need daily brushing, heart-aware breeding choices, and moderate walks. Never toxic foods.<br><br>See toy/spaniel shows and Cavalier club events.`,
    fr: `Le Cavalier King Charles est un épagneul toy affectueux — regard doux, oreilles soyeuses.<br><br>Histoire de compagnon britannique; famille douce partout.<br><br>Brossage, choix d’élevage attentif au cœur, marches modérées. Pas d’aliments toxiques.<br><br>Expos et clubs Cavalier.`,
  },
  shihtzu: {
    keys: ["shih tzu", "shihtzu", "shitzu"],
    en: `Shih Tzus are charming companion dogs with flowing coats and a regal little presence.<br><br>Tibetan/Chinese palace companion roots; now global lap and show favorites.<br><br>Daily coat care (or a puppy cut), dental attention, and short walks. Avoid rough play. No toxic foods.<br><br>See toy-group shows and Shih Tzu clubs.`,
    fr: `Le Shih Tzu est un compagnon charmant au long poil, petite allure de palace.<br><br>Racines tibétaines/chinoises; star des genoux et des expos.<br><br>Toilettage (ou coupe courte), dents, petites marches. Pas d’aliments toxiques.<br><br>Expos toy et clubs.`,
  },
  pomeranian: {
    keys: ["pomeranian", "pom ", "spitz nain"],
    en: `Pomeranians are fluffy toy spitz dogs — bright, vocal, and full of sparkle.<br><br>From larger sled-type spitz downsized in Europe; global companion icons.<br><br>Coat needs brushing; watch knees and dental health. Early manners curb “big dog in a small body.” No toxic foods.<br><br>See toy shows and Pomeranian club specialties.`,
    fr: `Le Spitz nain (Pomeranian) est un petit spitz flamboyant — vif, expressif, très présent.<br><br>Issu de plus grands spitz européens; compagnon mondial.<br><br>Brossage, genoux, dents. Éducation tôt. Pas d’aliments toxiques.<br><br>Expos toy et clubs.`,
  },
  whippet: {
    keys: ["whippet"],
    en: `Whippets are sleek sighthounds — gentle couch potatoes indoors, rockets on a sprint.<br><br>British racing/coursing roots; wonderful apartment athletes with soft temperaments.<br><br>Need warm coats in cold weather, secure off-leash spaces, and burst exercise. Never toxic foods.<br><br>See lure coursing and sighthound club events.`,
    fr: `Le Whippet est un lévrier fin — câlin à la maison, éclair en sprint.<br><br>Racines britanniques de course; super en appart avec de bons décharges.<br><br>Manteau par froid, espace sécurisé, exercices en rafales. Pas d’aliments toxiques.<br><br>Lure coursing et clubs.`,
  },
  greyhound: {
    keys: ["greyhound", "lévrier anglais"],
    en: `Greyhounds are the classic sprinting sighthound — often calm and sweet at home after a career or as a rescue companion.<br><br>Ancient racing/coursing history; popular adoptees worldwide.<br><br>Soft beds (thin skin/low body fat), warm coats, short bursts of speed in safe spaces. Never toxic foods.<br><br>See adoption groups and sighthound walks.`,
    fr: `Le Greyhound est le lévrier sprinteur — souvent calme et doux à la maison, surtout en adoption.<br><br>Histoire ancienne de course; adoptés partout.<br><br>Paniers moelleux, manteau, sprints en lieux sûrs. Pas d’aliments toxiques.<br><br>Associations d’adoption et balades lévriers.`,
  },
  doberman: {
    keys: ["doberman", "dobermann"],
    en: `Dobermans are sleek, loyal guardian-athletes — intelligent, trainable, and people-focused when well bred and socialized.<br><br>Created in Germany by Karl Friedrich Louis Dobermann; worldwide protection and companion roles.<br><br>Need training, daily exercise, and clear structure. Short coats feel cold. No toxic foods.<br><br>See working trials and Doberman club events.`,
    fr: `Le Dobermann est un athlète gardien élégant — intelligent, éducable, proche de l’humain s’il est bien socialisé.<br><br>Créé en Allemagne; protection et compagnie mondiales.<br><br>Éducation, exercice, cadre clair. Poil court: froid. Pas d’aliments toxiques.<br><br>Trials et clubs Dobermann.`,
  },
  samoyed: {
    keys: ["samoyed", "samoyède", "samoyede"],
    en: `Samoyeds are smiling Nordic spitz dogs — friendly, fluffy, and built for cold and company.<br><br>Siberian herding/sledding roots with the Samoyedic peoples; popular worldwide for that famous smile.<br><br>Heavy coat needs grooming; they shed; need exercise and hate extreme heat. No toxic foods.<br><br>See Nordic breed shows and Samoyed club events.`,
    fr: `Le Samoyède est un spitz nordique souriant — sociable, floké, fait pour le froid et la compagnie.<br><br>Racines sibériennes; célèbre “sourire” mondial.<br><br>Toilettage, mue, exercice, attention chaleur. Pas d’aliments toxiques.<br><br>Expos nordiques et clubs.`,
  },
  jackrussell: {
    keys: ["jack russell", "parson russell", "jrt"],
    en: `Jack Russell / Parson Russell Terriers are bold earth-dogs — fearless, busy, and clever.<br><br>British fox-hunting terrier roots; energetic companions worldwide.<br><br>Need serious mental work and secure fencing. Digging and barking are features, not bugs. No toxic foods.<br><br>See earthdog/terrier trials and Russell club events.`,
    fr: `Le Jack / Parson Russell est un terrier audacieux — courageux, occupé, malin.<br><br>Racines de chasse au renard; compagnon énergique partout.<br><br>Stimulation mentale, clôture solide. Creuser/aboyer font partie du package. Pas d’aliments toxiques.<br><br>Trials terrier et clubs.`,
  },
  weimaraner: {
    keys: ["weimaraner", "braque de weimar", "weim"],
    en: `Weimaraners are silver-gray gundogs — athletic, loyal, and often velcro with their people.<br><br>German hunting roots; popular active family dogs worldwide.<br><br>Need serious exercise and training. Separation can be hard. Short coats; watch joints. No toxic foods.<br><br>See field events and Weimaraner club specialties.`,
    fr: `Le Braque de Weimar est un chien de chasse gris argent — athlétique, loyal, souvent “velcro”.<br><br>Racines allemandes; famille active mondiale.<br><br>Gros besoin d’exercice et d’éducation. Séparation difficile. Pas d’aliments toxiques.<br><br>Field et clubs Weimar.`,
  },
};

/** Common misspellings / nicknames → canonical key fragment */
const BREED_TYPOS: Record<string, string> = {
  coli: "collie",
  colie: "collie",
  colly: "collie",
  colies: "collies",
  lab: "labrador",
  labs: "labrador",
  shepard: "shepherd",
  sheperd: "shepherd",
  shephard: "shepherd",
  gsd: "german shepherd",
  pitbul: "pitbull",
  pitbulls: "pit bull",
  frenchie: "french bulldog",
  yorky: "yorkshire",
  huskie: "husky",
  huskyes: "husky",
  pomeraniann: "pomeranian",
  pom: "pomeranian",
  rotty: "rottweiler",
  rottie: "rottweiler",
  dobermann: "doberman",
  dooberman: "doberman",
  weimeraner: "weimaraner",
  weimer: "weimaraner",
  dachshunds: "dachshund",
  dashchund: "dachshund",
  doxie: "dachshund",
  shitzu: "shih tzu",
  shihtzu: "shih tzu",
  malinoi: "malinois",
  mali: "malinois",
};

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const row = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) row[j] = j;
  for (let i = 1; i <= a.length; i++) {
    let prev = i - 1;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cur = row[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + cost);
      prev = cur;
    }
  }
  return row[b.length];
}

function normalizeQuery(text: string): string {
  let t = text.toLowerCase().replace(/[^a-z0-9àâäéèêëïîôùûüç\s'-]/gi, " ");
  // Expand known typos as whole words
  t = t.replace(/\b([a-z]{3,})\b/g, (w) => BREED_TYPOS[w] || w);
  return t.replace(/\s+/g, " ").trim();
}

function extractBreedCandidate(text: string): string | null {
  const t = text.toLowerCase().trim();
  const m =
    t.match(
      /(?:tell me about|about|what(?:'s| is)|who's|who is|parle[- ]moi (?:de|d')|c(?:'|’)est quoi|qu(?:'|’)est[- ]ce qu(?:'|’)un[e]?)\s+(.+)$/i
    ) || t.match(/^([a-z][a-z\s-]{2,40})$/i);
  if (!m?.[1]) return null;
  return m[1]
    .replace(/\?+$/, "")
    .replace(/\b(the|a|an|dog|breed|race|chien|please|pls)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function detectBreed(text: string): keyof typeof BREEDS | null {
  const t = normalizeQuery(text);
  // Longer keys first so "border collie" beats "collie"
  const ranked = Object.entries(BREEDS)
    .flatMap(([id, meta]) => meta.keys.map((k) => ({ id, key: k })))
    .sort((a, b) => b.key.length - a.key.length);

  for (const { id, key } of ranked) {
    if (t.includes(key)) return id as keyof typeof BREEDS;
  }

  // Fuzzy: candidate phrase or individual tokens vs keys
  const candidate = extractBreedCandidate(text);
  const tokens = [
    ...(candidate ? [normalizeQuery(candidate)] : []),
    ...t.split(/\s+/).filter((w) => w.length >= 3),
  ];

  let best: { id: keyof typeof BREEDS; dist: number } | null = null;
  for (const token of tokens) {
    const expanded = BREED_TYPOS[token] || token;
    for (const { id, key } of ranked) {
      const keyWords = key.split(/\s+/);
      for (const kw of [key, ...keyWords]) {
        if (kw.length < 3) continue;
        const dist = levenshtein(expanded, kw);
        const maxDist = kw.length <= 4 ? 1 : kw.length <= 7 ? 1 : 2;
        if (dist <= maxDist && (!best || dist < best.dist)) {
          best = { id: id as keyof typeof BREEDS, dist };
        }
      }
    }
  }
  return best && best.dist <= 2 ? best.id : null;
}

function isOffTopic(text: string): boolean {
  const t = normalizeQuery(text);
  if (detectBreed(text)) return false;
  const doggy =
    /dog|chien|breed|race|puppy|chiot|canine|labrador|poodle|caniche|shepherd|berger|beagle|collie|coli|teckel|dachshund|golden|frenchie|bouledogue|husky|shiba|bulldog|yorkie|yorkshire|boxer|rott|aussie|australian|corgi|maltese|akita|pitbull|pit bull|pittie|stafford|amstaff|staffy|staffie|bully|akc|fci|groom|toilet|train|éduc|walk|promenade|bark|aboie|leash|laisse|vet|véto|kibble|croquette|toxic|chocolat|xylitol|tell me about|parle[- ]moi|c’est quoi|c'est quoi|what about|about the|chihuahua|malinois|dane|newfoundland|bernese|cavalier|shih tzu|pomeranian|whippet|greyhound|doberman|samoyed|russell|weimaraner|mastiff|pointer/.test(
      t
    );
  return !doggy;
}

export function resolveBreedId(text: string): string | null {
  return detectBreed(text);
}

export function getBreedKnowledgeSnippet(
  text: string,
  locale: "en" | "fr"
): string | null {
  const id = detectBreed(text);
  if (!id) return null;
  const entry = BREEDS[id];
  const raw = locale === "fr" ? entry.fr : entry.en;
  return raw
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/?[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

function topicAngle(
  baseHtml: string,
  topic: string | null,
  locale: "en" | "fr",
  breedId: string
): string {
  const name =
    breedId === "pitbull"
      ? locale === "fr"
        ? "ces chiens bully"
        : "these bully-type dogs"
      : breedId.replace(/_/g, " ");

  if (topic === "training") {
    return locale === "fr"
      ? `${baseHtml}<br><br>Côté éducation pour ${name}: sessions courtes et positives, laisse douce, socialisation variée. Récompense ce que tu veux revoir. Tu bosses un point précis (rappels, aboiements, propreté)?`
      : `${baseHtml}<br><br>Training angle for ${name}: short positive sessions, soft leash manners, and varied socialization. Reward what you want to see again. Working on a specific snag (recall, barking, house manners)?`;
  }
  if (topic === "food") {
    return locale === "fr"
      ? `${baseHtml}<br><br>Alimentation: adapte les portions à l’activité, évite les restes gras, et jamais chocolat, xylitol, raisin, oignon. Tu veux des idées de friandises sûres?`
      : `${baseHtml}<br><br>Food angle: match portions to activity, skip fatty scraps, and never chocolate, xylitol, grapes, or onions. Want safe treat ideas next?`;
  }
  if (topic === "grooming") {
    return locale === "fr"
      ? `${baseHtml}<br><br>Toilettage: rythme selon le poil, oreilles/yeux à surveiller, et un brossage régulier limite les nœuds et la mue. Tu veux un planning simple?`
      : `${baseHtml}<br><br>Grooming angle: coat schedule, ears/eyes checks, and regular brushing cuts mats and shed. Want a simple care calendar?`;
  }
  if (topic === "apartment") {
    return locale === "fr"
      ? `${baseHtml}<br><br>Vie en appart: l’énergie compte plus que la taille — stimulation mentale + sorties qualité. Harnais solide en laisse. Ça colle à ton quotidien?`
      : `${baseHtml}<br><br>Apartment life: energy matters more than size — mental work plus quality walks. Sturdy harness on leash. Does that fit your day?`;
  }
  if (topic === "health") {
    return locale === "fr"
      ? `${baseHtml}<br><br>Santé: choisis des éleveurs qui testent, garde un suivi véto, et surveille poids + articulations selon la morphologie. Tu veux les points de vigilance typiques?`
      : `${baseHtml}<br><br>Health angle: prefer health-testing breeders, keep vet checkups, and watch weight plus joints for the build. Want typical watch-outs?`;
  }

  // Generic soft follow-up — still include real breed substance
  return locale === "fr"
    ? `${baseHtml}<br><br>Pour aller plus loin: éducation, alimentation, ou vie quotidienne — tu choisis.`
    : `${baseHtml}<br><br>Want to go deeper on training, food, or day-to-day life next?`;
}

export function offlineDogReply(
  userText: string,
  locale: "en" | "fr",
  history?: Msg[]
): OfflineResult {
  const namedNow = detectBreed(userText);
  // Only soft follow-ups — never treat "tell me about Poodles" as a continuation
  const softFollowUp =
    !namedNow &&
    /^(tell me more|more(?:\s+please)?|and then|what about (?:that|them|it|him|her)\b|how about (?:that|them|it)\b|go on|continue|another angle|dis-moi plus|encore|et (?:ensuite|après)|autre angle|continue|training tips|diet|foods?|éducation|alimentation|toilettage|grooming|apartment|appart)\b/i.test(
      userText.trim()
    );

  const priorBreed =
    namedNow ||
    (history || [])
      .slice()
      .reverse()
      .map((m) => detectBreed(m.content))
      .find(Boolean) ||
    null;

  const topic = (() => {
    const t = userText.toLowerCase();
    if (/train|éduc|puppy|chiot|leash|laisse|bark|aboie|obedi|sociali|training tips/.test(t))
      return "training";
    if (/food|diet|feed|eat|kibble|croquette|aliment|friandise|treat|diet &/.test(t))
      return "food";
    if (/groom|toilet|coat|poil|shed|mue|brush/.test(t)) return "grooming";
    if (/apart|appartement|flat|condo|small space/.test(t)) return "apartment";
    if (/health|santé|vet|véto/.test(t)) return "health";
    return null;
  })();

  // Soft follow-up OR topic on prior breed → topic-angled answer, not a vague stub
  if ((softFollowUp || (topic && !namedNow)) && priorBreed && BREEDS[priorBreed]) {
    const entry = BREEDS[priorBreed];
    const base = locale === "fr" ? entry.fr : entry.en;
    const angled = topicAngle(base, topic, locale, priorBreed);
    return {
      reply: angled,
      suggestions:
        locale === "fr"
          ? ["Éducation", "Alimentation", "Autre race"]
          : ["Training tips", "Diet & foods", "Another breed"],
    };
  }

  const breed = namedNow || (softFollowUp ? priorBreed : null);
  if (breed && BREEDS[breed]) {
    const entry = BREEDS[breed];
    return {
      reply: locale === "fr" ? entry.fr : entry.en,
      suggestions:
        locale === "fr"
          ? ["Éducation", "Alimentation", "Autre race"]
          : ["Training tips", "Diet & foods", "Another breed"],
    };
  }

  if (
    /cook|recipe|dinner|tonight|cuisine|dîner|recette|souper/i.test(userText)
  ) {
    return {
      reply:
        locale === "fr"
          ? `Bonne question cuisine! Pour ce soir, vise quelque chose de simple — grillades, pâtes, ou un wok de légumes.<br><br>Et côté chiens: garde chocolat, xylitol (édulcorant), raisin, oignon, ail et avocat loin de la gamelle. Les restes gras peuvent aussi déranger leur estomac.<br><br>Tu veux que je te parle d’alimentation adaptée à une race en particulier?`
          : `Great cooking question! Tonight, keep it simple — a sheet-pan dinner, pasta, or a quick stir-fry works on busy evenings.<br><br>Dog tie-in: keep chocolate, xylitol (sweetener), grapes, onions, garlic, and avocado away from pups. Fatty leftovers can upset stomachs too.<br><br>Want breed-specific feeding tips next?`,
      suggestions:
        locale === "fr"
          ? ["Aliments toxiques", "Races et croquettes", "Caniche"]
          : ["Toxic foods list", "Breed diet tips", "Poodles"],
    };
  }

  if (/toxic|chocolat|xylitol|grape|raisin|onion|oignon|poison|danger.*food|aliment.*tox/i.test(userText)) {
    return {
      reply:
        locale === "fr"
          ? `Aliments à ne jamais donner: chocolat, xylitol (chewing-gum / certains beurres de cacahuète), raisin et raisins secs, oignon, ail, avocat, alcool, café/thé, et os cuits qui se splinter.<br><br>En cas d’ingestion, contacte un véto ou un centre antipoison animal rapidement — ne fais pas vomir sans avis.<br><br>Tu veux des idées de friandises sûres ou des conseils pour une race?`
          : `Never feed: chocolate, xylitol (gum / some peanut butters), grapes and raisins, onions, garlic, avocado, alcohol, caffeine, and cooked bones that splinter.<br><br>If your dog eats something risky, call a vet or pet poison hotline fast — don’t induce vomiting unless told to.<br><br>Want safe treat ideas or breed feeding tips next?`,
      suggestions:
        locale === "fr"
          ? ["Friandises sûres", "Choisir une race", "Éducation"]
          : ["Safe treats", "Choosing a breed", "Training tips"],
    };
  }

  if (/train|éduc|puppy|chiot|leash|laisse|bark|aboie|obedi/i.test(userText)) {
    return {
      reply:
        locale === "fr"
          ? `Éducation: courtes sessions positives (récompense), laisse douce, socialisation variée, et une routine claire. Les chiots ont besoin de pauses — fatigue ≠ désobéissance.<br><br>Pour les aboiements: cherche la cause (ennui, alerte, demande) avant de corriger.<br><br>Dis-moi l’âge et la race (ou le problème précis) et on affine.`
          : `Training basics: short positive sessions, soft leash manners, varied socialization, and a clear routine. Puppies need naps — tired isn’t “stubborn.”<br><br>For barking: find the why (boredom, alarm, asking) before correcting.<br><br>Tell me age + breed (or the exact snag) and we’ll tailor it.`,
      suggestions:
        locale === "fr"
          ? ["Socialisation", "Propreté", "Caniche"]
          : ["Socialization", "House training", "Poodles"],
    };
  }

  if (/choose|choisir|which breed|quelle race|best dog|bon chien|apart|appartement|family|famille/i.test(userText)) {
    return {
      reply:
        locale === "fr"
          ? `Pour choisir: énergie (sportif vs calme), poil/toilettage, taille, expérience, enfants, et temps dispo. Appart → souvent compagnons moins “endurance”; maison + jardin → plus d’options actives.<br><br>Évite d’acheter sur un coup de cœur Instagram — parle à des clubs de race et des éleveurs qui testent la santé.<br><br>Décris ton quotidien (ville/campagne, heures hors maison, enfants) et je te propose 3 pistes.`
          : `To choose well: energy level, coat/grooming, size, your experience, kids, and time. Apartments often suit lower-endurance companions; house + yard opens more athletic options.<br><br>Skip impulse Instagram buys — talk to breed clubs and health-testing breeders.<br><br>Describe your day (city/country, hours away, kids) and I’ll suggest 3 fits.`,
      suggestions:
        locale === "fr"
          ? ["Appartement", "Famille avec enfants", "Premier chien"]
          : ["Apartment life", "Family with kids", "First dog"],
    };
  }

  if (isOffTopic(userText)) {
    const t = userText.toLowerCase();
    let reply: string;
    if (/cook|recipe|food|dinner|cuisine|dîner|recette|pizza|coffee|café/i.test(t)) {
      reply =
        locale === "fr"
          ? `Ça sent bon d’ici! Pendant que tu mijotes, petite pensée canidé: chocolat, xylitol, raisin et oignon restent hors gamelle — même une bouchée “sympa” peut mal finir.<br><br>Tu veux une liste de friandises sûres, ou on parle d’une race gourmande type Labrador?`
          : `That smells amazing from here! While you’re in the kitchen, a quick paw-note: chocolate, xylitol, grapes, and onions stay out of the bowl — even a “tiny taste” can go wrong.<br><br>Want a safe-treat list, or shall we geek out on a food-motivated breed like the Labrador?`;
    } else if (/travel|flight|avion|trip|voyage|hotel|vacance/i.test(t)) {
      reply =
        locale === "fr"
          ? `Les valises, ça donne des papillons — et aux chiens aussi. Certaines races voyagent zen en voiture; d’autres stressent en cabine.<br><br>Tu pars avec un compagnon à quatre pattes, ou tu veux des races plutôt “globetrotteuses”?`
          : `Suitcases give butterflies — dogs get them too. Some breeds are road-trip zen; others melt down in a cabin.<br><br>Traveling with a pup, or curious which breeds handle adventures best?`;
    } else if (/movie|film|netflix|series|série|cinema|cinéma/i.test(t)) {
      reply =
        locale === "fr"
          ? `Bon film en vue! Ça me rappelle Lassie, Hachi, ou le Border Collie trop intelligent des pubs…<br><br>Tu préfères les races “stars de cinéma”, ou une vraie fiche race pour ce soir?`
          : `Movie night vibes! Makes me think of Lassie, Hachi, or those too-smart Border Collies in commercials…<br><br>Want famous film-dog breeds, or a real breed deep-dive for tonight?`;
    } else if (/sport|gym|run|foot|soccer|basket|workout|sportif/i.test(t)) {
      reply =
        locale === "fr"
          ? `Cette énergie mériterait un partenaire de canicross ou d’agility! Les Border Collies et les Malinois vivent pour ça — d’autres préfèrent la sieste après deux jets de balle.<br><br>Tu cherches une race sportive, ou des idées d’exercices pour ton chien?`
          : `That energy deserves a canicross or agility buddy! Border Collies and Malinois live for it — others are done after two tennis balls.<br><br>Looking for a sporty breed, or workout ideas for a dog you already love?`;
    } else if (/weather|rain|snow|hot|cold|météo|pluie|neige|chaud|froid/i.test(t)) {
      reply =
        locale === "fr"
          ? `Selon le ciel, certaines races rayonnent — Huskies dans le froid, lévriers qui fondent dès qu’il fait trop chaud.<br><br>Tu adaptes les promenades à la météo, ou tu veux des races faites pour ton climat?`
          : `Weather picks favorites — Huskies glow in the cold; sighthounds wilt when it spikes hot.<br><br>Tweaking walks for the forecast, or hunting breeds built for your climate?`;
    } else if (/work|job|office|bureau|meeting|réunion|career|travail/i.test(t)) {
      reply =
        locale === "fr"
          ? `Journée chargée… les chiens d’assistance et de détection bossent aussi, avec un focus impressionnant.<br><br>Tu veux des races “bureau-friendly”, ou des histoires de chiens au travail?`
          : `Busy day… service and detection dogs clock in too, with wild focus.<br><br>Curious about office-friendly breeds, or dogs with real jobs?`;
    } else {
      reply =
        locale === "fr"
          ? `Hmm, ça ouvre plein d’images — et ça me fait penser à quel chien collerait à cette vibe.<br><br>Si c’était une race: plutôt curieuse et sportive, câline d’appart, ou garde du cœur à la maison? Dis-moi et on creuse.`
          : `Hmm, that paints a picture — and it makes me wonder which dog would match that vibe.<br><br>If it were a breed: curious athlete, apartment cuddler, or loyal heart-of-the-home? Tell me and we’ll dig in.`;
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
        ? `Je suis Dooogs!, guide races & chiens du monde entier: origines, caractère, mode de vie, alimentation, éducation, toilettage, et où en voir davantage.<br><br>Pose-moi une race (ex. caniche, labrador) ou une question précise — je reste dans le fil de notre conversation.`
        : `I’m Dooogs!, your guide to dogs and breeds worldwide — origins, personality, lifestyle, diet, training, grooming, and where to see more.<br><br>Ask about any breed (poodle, labrador…) or a specific question — I’ll keep our conversation in context.`,
    suggestions:
      locale === "fr"
        ? ["Caniche", "Labrador", "Comment choisir"]
        : ["Poodles", "Labradors", "How to choose"],
  };
}
