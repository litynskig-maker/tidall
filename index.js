process.on("uncaughtException", console.error);
process.on("unhandledRejection", console.error);

const fs = require("fs");
const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  ContainerBuilder,
  SeparatorSpacingSize,
  MessageFlags,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionsBitField,
  Partials
} = require("discord.js");

require("dotenv").config();

const TOKEN = process.env.TOKEN || "WKLEJ_TUTAJ_POPRAWNY_TOKEN";
const CLIENT_ID = "1501217038780207254";
const GUILD_ID = "1397178762562637844";

const IDS = {
  ticket: {
    sellerRole: "1500480386046627940",
    verifiedRole: "1500482147939516537",
    categorySprzedaz: "1501208385557627001",
    categoryZakup: "1500502771416301728",
    categoryPytania: "1500503047170822415",
    categoryInne: "1500503009212240103",
    categoryClaimed: "1500503324204601454",
    categorySales: "1501209125944688782",
    categoryDone: "1500502907408089168"
  },
  regulamin: {
    reportCategory: "1500544423078137976"
  },
  drop: {
    role: "1502684076858019901"
  },
  czyLegit: {
    yesEmoji: "1405253718873473214",
    noEmoji: "1405242693847744605",
    bypassRole: "1500479810684719330"
  },
  verify: {
    role: "1397178762562637845"
  },
  konkurs: {
    ticketChannelId: "1500485926529531944"
  },
  rekrutacja: {
    category: "1500503101818540242",
    staffRole: "1500480174829994154",
    categoryDone: "1500502907408089168"
  },
  welcome: {
    channel: "1405226913525665813"
  },
  legitcheck: {
    channel: "1405221301529874632"
  },
  dailyLc: {
    sendChannel: "1500487361182826577",
    counterChannel: "1500487361182826577"
  }
};

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildPresences
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

const flagsComponents = MessageFlags.IsComponentsV2;
const flagsComponentsEphemeral = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;

const salesCount = new Map();
const salesTotal = new Map();
const dropCooldown = new Map();
const mathQuestions = new Map();
const giveaways = new Map();
const ticketPaymentData = new Map();

let dailyMoney = 0;
let database = {};

if (fs.existsSync("./database.json")) {
  database = JSON.parse(fs.readFileSync("./database.json", "utf8"));
}

const RANKS = [
  { amount: 2000, role: "1500481205550710784", name: "︲Klient 2000+" },
  { amount: 1500, role: "1500481360970911816", name: "︲Klient 1500+" },
  { amount: 1000, role: "1500481637958553700", name: "︲Klient 1000+" },
  { amount: 500, role: "1500481710129807581", name: "︲Klient 500+" },
  { amount: 200, role: "1500481848524935236", name: "︲Klient 200+" },
  { amount: 1, role: "1500482147939516537", name: "︲Klient" }
];

const commands = [
  new SlashCommandBuilder().setName("ticket").setDescription("Panel ticketów"),
  new SlashCommandBuilder().setName("prowizje").setDescription("Pokazuje prowizje"),
  new SlashCommandBuilder().setName("regulamin").setDescription("Panel regulaminu"),
  new SlashCommandBuilder().setName("drop").setDescription("Drop system"),
  new SlashCommandBuilder().setName("czylegit").setDescription("Wysyła panel legit"),
  new SlashCommandBuilder().setName("verify").setDescription("Panel weryfikacji"),
  new SlashCommandBuilder().setName("konkurs").setDescription("Stwórz konkurs"),
  new SlashCommandBuilder().setName("rekrutacja").setDescription("Panel rekrutacji"),
  new SlashCommandBuilder().setName("legitcheck").setDescription("Panel legit check"),
  new SlashCommandBuilder().setName("panelklienta").setDescription("Panel klienta"),
  new SlashCommandBuilder()
    .setName("dodajzakup")
    .setDescription("Dodaj zakup użytkownikowi")
    .addUserOption(o => o.setName("uzytkownik").setDescription("Klient").setRequired(true))
    .addNumberOption(o => o.setName("kwota").setDescription("Kwota").setRequired(true)),
  new SlashCommandBuilder().setName("cennik").setDescription("Panel cennika"),
  new SlashCommandBuilder().setName("kalkulator").setDescription("Kalkulator waluty")
].map(command => command.toJSON());

function saveData() {
  fs.writeFileSync("./database.json", JSON.stringify(database, null, 2));
}

function createUser(userId) {
  if (!database[userId]) {
    database[userId] = {
      spent: 0,
      history: []
    };
  }
}

async function updateRanks(member, spent) {
  for (const rank of RANKS) {
    if (spent >= rank.amount) {
      if (!member.roles.cache.has(rank.role)) {
        await member.roles.add(rank.role).catch(() => {});
      }
    } else if (member.roles.cache.has(rank.role)) {
      await member.roles.remove(rank.role).catch(() => {});
    }
  }
}

function getCurrentRank(member) {
  for (const rank of RANKS) {
    if (member.roles.cache.has(rank.role)) {
      return rank.name;
    }
  }

  return "Brak rangi";
}

function getNextRank(spent) {
  const sorted = [...RANKS].reverse();

  for (const rank of sorted) {
    if (spent < rank.amount) {
      return {
        needed: (rank.amount - spent).toFixed(2),
        name: rank.name
      };
    }
  }

  return null;
}

function safeUsername(username) {
  const safe = username.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  return safe || "user";
}

function formatNow() {
  const now = new Date();
  return (
    `${String(now.getDate()).padStart(2, "0")}.` +
    `${String(now.getMonth() + 1).padStart(2, "0")}.` +
    `${now.getFullYear()} ` +
    `${String(now.getHours()).padStart(2, "0")}:` +
    `${String(now.getMinutes()).padStart(2, "0")}`
  );
}

function getYesterdayDate() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toLocaleDateString("pl-PL");
}

function addMoney(amount) {
  dailyMoney += Number(amount) || 0;
}

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(TOKEN);
  await rest.put(
    Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
    { body: commands }
  );
}

function buildRegulaminPage(page) {
  if (page === 1) {
    return new ContainerBuilder()
      .setAccentColor(0x2b2d31)
      .addTextDisplayComponents(t =>
        t.setContent("# ```                   🌊︲τɩᴅɑʟᴍᴀʀᴋɛᴛ™ × ʀɛɢᴜʟɑᴍɪɴ - ꜱᴛʀᴏɴᴀ 𝟣/𝟦```")
      )
      .addSeparatorComponents(s => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(t =>
        t.setContent(
`# 1. P𝚘stɑn𝚘wɩɛnɩɑ Ogólne
> \`1.1.\` Sklep TidalMarket sprzedaje cyfrowe przedmioty oraz walutę do gry Minecraft.
> \`1.2.\` Sklep działa wyłącznie poprzez serwer Discord i jego kanały.
> \`1.3.\` Sklep nie jest powiązany z Mojang AB ani Microsoft.
> \`1.4.\` Dokonując zakupu użytkownik akceptuje niniejszy regulamin.
> \`1.5.\` Administracja może zmienić regulamin w dowolnym momencie.`
        )
      )
      .addSeparatorComponents(s => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addActionRowComponents(row =>
        row.addComponents(
          new ButtonBuilder().setCustomId("regulamin_prev_1").setLabel("← Poprzednia").setStyle(ButtonStyle.Secondary).setDisabled(true),
          new ButtonBuilder().setCustomId("regulamin_next_2").setLabel("Następna →").setStyle(ButtonStyle.Secondary)
        )
      )
      .addSeparatorComponents(s => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(t =>
        t.setContent("-# <:tidallogo:1500523012653584456>  © 2026 TɩdalMarket × Regulamin")
      );
  }

  if (page === 2) {
    return new ContainerBuilder()
      .setAccentColor(0x2b2d31)
      .addTextDisplayComponents(t =>
        t.setContent("# ```                   🌊︲τɩᴅɑʟᴍᴀʀᴋɛᴛ™ × ʀɛɢᴜʟɑᴍɪɴ - ꜱᴛʀᴏɴᴀ 𝟤/𝟦```")
      )
      .addSeparatorComponents(s => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(t =>
        t.setContent(
`# 2. Zɑkupy
> \`2.1.\` Zakup odbywa się tylko przez oficjalne kanały sklepu.
> \`2.2.\` Po płatności należy podać poprawny nick w grze.
> \`2.3.\` Czas realizacji zamówienia wynosi do 24 godzin.
> \`2.4.\` W wyjątkowych sytuacjach czas realizacji może się wydłużyć.`
        )
      )
      .addSeparatorComponents(s => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addActionRowComponents(row =>
        row.addComponents(
          new ButtonBuilder().setCustomId("regulamin_prev_1").setLabel("← Poprzednia").setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId("regulamin_next_3").setLabel("Następna →").setStyle(ButtonStyle.Secondary)
        )
      )
      .addSeparatorComponents(s => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(t =>
        t.setContent("-# <:tidallogo:1500523012653584456>  © 2026 TɩdalMarket × Regulamin")
      );
  }

  if (page === 3) {
    return new ContainerBuilder()
      .setAccentColor(0x2b2d31)
      .addTextDisplayComponents(t =>
        t.setContent("# ```                   🌊︲τɩᴅɑʟᴍᴀʀᴋɛᴛ™ × ʀɛɢᴜʟɑᴍɪɴ - ꜱᴛʀᴏɴᴀ 𝟥/𝟦```")
      )
      .addSeparatorComponents(s => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(t =>
        t.setContent(
`# 3. Rɛɑlɩzɑcjɑ
> \`3.1.\` Reklamacje można zgłosić gdy:
• nie otrzymano produktu
• produkt jest niezgodny z zamówieniem
> \`3.2.\` Do reklamacji wymagane są:
• nagranie z zakupu/odbioru
• potwierdzenie płatności
• opis problemu
> \`3.3\` Czas rozpatrzenia reklamacji: do 72 godzin.
> \`3.4\` Reklamacje bez dowodów mogą zostać odrzucone.`
        )
      )
      .addSeparatorComponents(s => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addActionRowComponents(row =>
        row.addComponents(
          new ButtonBuilder().setCustomId("regulamin_prev_2").setLabel("← Poprzednia").setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId("regulamin_next_4").setLabel("Następna →").setStyle(ButtonStyle.Secondary)
        )
      )
      .addSeparatorComponents(s => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(t =>
        t.setContent("-# <:tidallogo:1500523012653584456>  © 2026 TɩdalMarket × Regulamin")
      );
  }

  return new ContainerBuilder()
    .setAccentColor(0x2b2d31)
    .addTextDisplayComponents(t =>
      t.setContent("# ```                   🌊︲τɩᴅɑʟᴍᴀʀᴋɛᴛ™ × ʀɛɢᴜʟɑᴍɪɴ - ꜱᴛʀᴏɴᴀ 𝟦/𝟦```")
    )
    .addSeparatorComponents(s => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(t =>
      t.setContent(
`# 4. Bezpieczeństwo
> \`4.1.\` Obowiązuje zakaz handlu poza kanałami sklepu.
> \`4.2.\` Sklep nie odpowiada za transakcje prywatne.
> \`4.3.\` Administracja nigdy nie prosi o hasła do kont.`
      )
    )
    .addSeparatorComponents(s => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small))
    .addActionRowComponents(row =>
      row.addComponents(
        new ButtonBuilder().setCustomId("regulamin_prev_3").setLabel("← Poprzednia").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("regulamin_next_4").setLabel("Następna →").setStyle(ButtonStyle.Secondary).setDisabled(true)
      )
    )
    .addSeparatorComponents(s => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(t =>
      t.setContent("-# <:tidallogo:1500523012653584456>  © 2026 TɩdalMarket × Regulamin")
    );
}

function buildLegitPanel() {
  return new ContainerBuilder()
    .setAccentColor(0x5865F2)
    .addTextDisplayComponents(t =>
      t.setContent("# ```                   🌊︲τɩᴅᴀʟᴍᴀʀᴋɛᴛ™ × ʟɛɢɩτ ᴄʜɛᴄᴋ```")
    )
    .addSeparatorComponents(s => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(t =>
      t.setContent(
`> <:olowek:1501961187347136646>**︲Wzór:**
**\`\`+rep @sɛllɛr x1 [pr𝚘dukt] [ɩle kαsy zαkupiłɛś] [sɛrwɛr & τryb] [Mɛt𝚘dα Płαtn𝚘ścɩ] [Kw𝚘tα PLN]\`\`**

> <:info:1500536149498659069>**︲Przykłαd:**
**\`\`+rep @hwyyyy715 x1 kαsα 250k αnαrchiα lf [BLIK] [37.00 PLN]\`\`**`
      )
    )
    .addSeparatorComponents(s => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(t =>
      t.setContent("-# <:tidallogo:1493692306438754387>  © 2026 TidalMark3t™ × Lɛgɩt Chɛck")
    );
}

async function refreshLegitPanel(channel) {
  const messages = await channel.messages.fetch({ limit: 20 });
  const oldPanel = messages.find(m => m.author.id === client.user.id && m.components.length > 0);

  if (oldPanel) {
    await oldPanel.delete().catch(() => {});
  }

  await channel.send({
    components: [buildLegitPanel()],
    flags: flagsComponents
  });
}

async function getLegitChecks() {
  const guild = await client.guilds.fetch(GUILD_ID);
  const channel = await guild.channels.fetch(IDS.legitcheck.channel);
  const match = channel.name.match(/(\d+)$/);
  return match ? parseInt(match[1], 10) : 0;
}

async function sendDailyStats() {
  const guild = await client.guilds.fetch(GUILD_ID);
  const sendChannel = await guild.channels.fetch(IDS.dailyLc.sendChannel);
  const counterChannel = await guild.channels.fetch(IDS.dailyLc.counterChannel);
  const legit = await getLegitChecks();
  const money = dailyMoney;

  const container = new ContainerBuilder()
    .setAccentColor(0x2b2d31)
    .addTextDisplayComponents(t =>
      t.setContent("# ```                 🌊︲ᴛɪᴅᴀʟᴍᴀʀᴋᴇᴛ™ × ᴅᴢɪᴇɴɴᴇ ʟᴇɢɪᴛᴄʜᴇᴄᴋɪ            ```")
    )
    .addSeparatorComponents(s => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(t =>
      t.setContent(
`> - <a:strzalka:1500519151150567475>︲**Z dnia: \`${getYesterdayDate()}\`**
> - <a:strzalka:1500519151150567475>︲**Zdobyliśmy Dzisiaj: \`${legit} Legitchecków\`**
> - <a:strzalka:1500519151150567475>︲**Zarobiliśmy dzisiaj: \`${money} PLN\`**

<:serduszko:1498972079335149648>︲**Dziękujemy że jesteście z nami!** To __dzięki wam__ \`TidalMarket\` osiąga __takie wyniki__!`
      )
    )
    .addSeparatorComponents(s => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(t =>
      t.setContent("-# <:tidallogo:1493692306438754387>  © 2026 TidalMarkɛt™ × Dziɛnnɛ LC")
    );

  await sendChannel.send({
    components: [container],
    flags: flagsComponents
  });

  dailyMoney = 0;
  await counterChannel.setName("🔥︲dzɩɛnnɛˑlɛgitchɛckɩ➔0").catch(() => {});
}

function scheduleDailyStats() {
  const now = new Date();
  const next = new Date(now);
  next.setHours(24, 0, 0, 0);
  const delay = next.getTime() - now.getTime();

  setTimeout(async () => {
    await sendDailyStats().catch(console.error);
    scheduleDailyStats();
  }, delay);
}

async function handleSlashCommand(interaction) {
  if (interaction.commandName === "ticket") {
    const menu = new StringSelectMenuBuilder()
      .setCustomId("ticket_select")
      .setPlaceholder("💡︲Wybierz Interesującą Cię Kategorie Ticketa!")
      .addOptions([
        {
          label: "Zakup",
          description: "kliknij, żeby Zakupić kase / usługi developerskie",
          value: "zakup",
          emoji: { id: "1501211663284572284" }
        },
        {
          label: "Sprzedaż",
          description: "kliknij, aby sprzedać kasę",
          value: "sprzedaz",
          emoji: { id: "1500517712948891739" }
        },
        {
          label: "Pytanie",
          description: "kliknij, jeżeli masz pytanie",
          value: "pytanie",
          emoji: { id: "1499356531878002778" }
        },
        {
          label: "Inne",
          description: "Kliknij jak masz inną sprawę",
          value: "inne",
          emoji: { id: "1500517752304304178" }
        }
      ]);

    const container = new ContainerBuilder()
      .setAccentColor(0x5865F2)
      .addTextDisplayComponents(t =>
        t.setContent("# **```                   🌊︲τɩᴅᴀʟᴍᴀʀᴋɛᴛ™ × ᴜτᴡᴏ́ʀᴢ ᴛɩᴄᴋɛᴛɑ```**")
      )
      .addSeparatorComponents(s => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(t =>
        t.setContent(
`> <:k0szyk:1501211663284572284>︲**Chcesz zakupic kaske** na swoim __ulubionym__ serwerze lub __potrzebujesz pomocy__ od
> administracji? Bądź cokolwiek innego?

> -# <a:strzalka:1500519151150567475> ︲Wybierz jedną z opcji poniżej, a my się tym zajmiemy!`
        )
      )
      .addSeparatorComponents(s => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addActionRowComponents(row => row.addComponents(menu))
      .addSeparatorComponents(s => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(t =>
        t.setContent("-# <:tidallogo:1500523012653584456> © 2026 TidalMark3t™  » Legitny sklep × Ticket panel")
      );

    return interaction.reply({
      components: [container],
      flags: flagsComponents
    });
  }

  if (interaction.commandName === "prowizje") {
    const container = new ContainerBuilder()
      .setAccentColor(0x5865F2)
      .addTextDisplayComponents(t =>
        t.setContent("# ```                 🌊︲ᴛɪᴅᴀʟᴍᴀʀᴋᴇᴛ™ × ᴘʀᴏᴡɪᴢᴊᴇ            ```")
      )
      .addSeparatorComponents(s => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(t =>
        t.setContent(
`> - <:blik:1500517807404617859> **︲BLIK NA NR** - **\`0% Prowizji\`**
> - <:ltc:1500517896374452244> **︲LTC** - **\`0% Prowizji\`**
> - <:crypt0:1500517991417385155> **︲Cryptowaluty** - **\`2% Prowizji\`**
> - <:payp4l:1501546157741051964> **︲PayPal** - **\`8% Prowizji\`**
> - <:blik:1500517807404617859> **︲Kod BLIK** - **\`10% Prowizji\`**
> - <:psc2:1500518038867542026> **︲PSC z paragonem** - **\`15% Prowizji\`**
> - <:psc1:1500517224148897892> **︲MyPSC** - **\`20% Prowizji, min. 25.00 PLN\`**
> - <:psc2:1500518038867542026> **︲PSC bez paragonu** - **\`25% Prowizji\`**
> - <:R3v0:1501546418719035452> **︲Revolut** - **\`5% Prowizji\`**`
        )
      )
      .addSeparatorComponents(s => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(t =>
        t.setContent("-# <:tidallogo:1500523012653584456> © 2026 Tidalmark3t × Mɛtоdy Płɑtnоścɩ")
      );

    return interaction.reply({
      components: [container],
      flags: flagsComponents
    });
  }

  if (interaction.commandName === "regulamin") {
    const container = new ContainerBuilder()
      .setAccentColor(0x2b2d31)
      .addTextDisplayComponents(t =>
        t.setContent("# ```                   🌊︲τɩᴅɑʟᴍᴀʀᴋɛᴛ™ × ʀɛɢᴜʟɑᴍɪɴ```")
      )
      .addSeparatorComponents(s => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(t =>
        t.setContent(
`> <a:strzalka:1500519151150567475>︲**Bycie** na __naszym serwerze__, oznacza **automatyczną** akceptacje __regulaminu__.
> <a:strzalka:1500519151150567475>︲**Jeśli masz jakiś** problem, bądź __pytanie__ możesz **odrazu** nam to __zgłosić__.`
        )
      )
      .addSeparatorComponents(s => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addActionRowComponents(row =>
        row.addComponents(
          new ButtonBuilder()
            .setCustomId("regulamin_open")
            .setLabel("︲Kliknij, aby zapoznać się z regulaminem")
            .setEmoji("1500536149498659069")
            .setStyle(ButtonStyle.Secondary)
        )
      )
      .addSeparatorComponents(s => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(t =>
        t.setContent("-# <:tidallogo:1500523012653584456>  © 2026 Tɩdalmarket × Regulamin")
      );

    return interaction.reply({
      components: [container],
      flags: flagsComponents
    });
  }

  if (interaction.commandName === "drop") {
    const container = new ContainerBuilder()
      .setAccentColor(0x2b2d31)
      .addTextDisplayComponents(t =>
        t.setContent("# ```                 🌊︲ᴛɪᴅᴀʟᴍᴀʀᴋᴇᴛ™ × ᴅʀᴏᴘ            ```")
      )
      .addSeparatorComponents(s => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(t =>
        t.setContent(
`> <:prez3nt:1502016024973676645>**︲Witaj** w **__dr𝚘pach__**! Dzięki niemu __wylosujesz__ raz na **\`6h\`** dowalone znɩżkɩ i nagrody! Właśnie __nimi__ kupɩsz u nas __**RZECZY**__ o tyle __%%__ tanɩej, ile **wylosowałeś** lub gdy dostaniesz **kase** możesz ją wymienić na __**tickecie**__ na walute serwerową!`
        )
      )
      .addSeparatorComponents(s => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addActionRowComponents(row =>
        row.addComponents(
          new ButtonBuilder()
            .setCustomId("drop_roll")
            .setLabel("︲Kliknij, aby wylosować swoją nagrodę!")
            .setEmoji("1502016024973676645")
            .setStyle(ButtonStyle.Secondary)
        )
      )
      .addSeparatorComponents(s => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(t =>
        t.setContent("-# <:tidallogo:1500523012653584456>  © 2026 Tidalmark3t × Drop")
      );

    await interaction.reply({ content: "✅ Panel wysłany!", ephemeral: true });
    return interaction.channel.send({
      components: [container],
      flags: flagsComponents
    });
  }

  if (interaction.commandName === "czylegit") {
    const container = new ContainerBuilder()
      .setAccentColor(0x5865F2)
      .addTextDisplayComponents(t =>
        t.setContent("# ```                   🌊︲τɩᴅᴀʟᴍᴀʀᴋɛᴛ™ × ᴄᴢʏ ᴊɛꜱᴛɛśᴍʏ ʟɛɢɩᴛ```")
      )
      .addSeparatorComponents(s => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(t =>
        t.setContent(
`> <:t4k:1501639343222296576> **×** Jeśli **uważasz**, że __**TAK**__, **zaznacz reakcje** <a:y3s:1405253718873473214> __pod__ **wiadomością!**
> <:nie:1500517511257653388> **×** Jeżeli **uważasz**, że __**NIE**__ **zaznacz reakcję** <a:n0:1405242693847744605> __pod__ **wiadomością!**

> -# <a:strzalka:1500519151150567475> **︲Zaznaczenie** reakcji <:an0:1405242693847744605> __bez dowodu__ skutkuje **__natychmiastową__ przerwą na 7 dni**!`
        )
      )
      .addSeparatorComponents(s => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(t =>
        t.setContent("-# <:tidallogo:1500523012653584456> © 2026 TɩdalMarket × Zaznacz Reakcje")
      );

    const msg = await interaction.reply({
      components: [container],
      flags: flagsComponents,
      fetchReply: true
    });

    await msg.react(IDS.czyLegit.yesEmoji);
    return msg.react(IDS.czyLegit.noEmoji);
  }

  if (interaction.commandName === "verify") {
    const container = new ContainerBuilder()
      .setAccentColor(0x5865F2)
      .addTextDisplayComponents(t =>
        t.setContent("# ```                   🌊︲τɩᴅᴀʟᴍᴀʀᴋɛᴛ™ × ᴡɛʀʏꜰɩᴋᴀᴄᴊᴀ```")
      )
      .addSeparatorComponents(s => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(t =>
        t.setContent(
`> <a:strzalka:1500519151150567475> **︲**Aby **przejść weryfikację** prosimy o __kliknięcie poniższego przycisku.__
> <a:strzalka:1500519151150567475> **︲**Gdy dokonasz weryfikacji **__nasz bot__** automatycznie __nada dostęp do reszty kanałów.__`
        )
      )
      .addSeparatorComponents(s => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addActionRowComponents(row =>
        row.addComponents(
          new ButtonBuilder()
            .setCustomId("verify_button")
            .setLabel("︲Kliknij, aby przejść do weryfikacjii!")
            .setEmoji("1501639343222296576")
            .setStyle(ButtonStyle.Secondary)
        )
      )
      .addSeparatorComponents(s => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(t =>
        t.setContent("-# <:tidallogo:1500523012653584456> © 2026 TidalMarket × Weryfikacja")
      );

    return interaction.reply({
      components: [container],
      flags: flagsComponents
    });
  }

  if (interaction.commandName === "konkurs") {
    const modal = new ModalBuilder()
      .setCustomId("konkurs_modal")
      .setTitle("Konkurs");

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId("reward").setLabel("Co można wygrać?").setStyle(TextInputStyle.Short)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId("winners").setLabel("Ile osób może wygrać?").setStyle(TextInputStyle.Short)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId("days").setLabel("Za ile dni ma się skończyć konkurs?").setStyle(TextInputStyle.Short)
      )
    );

    return interaction.showModal(modal);
  }

  if (interaction.commandName === "rekrutacja") {
    const container1 = new ContainerBuilder()
      .setAccentColor(0x5865F2)
      .addTextDisplayComponents(t =>
        t.setContent("# ```                   🌊︲τɩᴅᴀʟᴍᴀʀᴋɛᴛ™ × ʀɛᴋʀᴜᴛᴀᴄᴊᴀ```")
      )
      .addSeparatorComponents(s => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(t =>
        t.setContent(
`> <:ml0t:1501668924482392154>︲**Z dumą zespół \`TidalMarket\` otwiera __rekrutację!__** Chcesz zostać __sprzedawcą__ na shopie z 
> __Anarchii.gg?__ Jeżeli tak, to stwórz podanie, **ale wpierw zapoznaj się z zasadami.**

> -# <a:strzalka:1500519151150567475> ︲Wybierz jedną z opcji poniżej, a my się tym zajmiemy!`
        )
      )
      .addSeparatorComponents(s => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addActionRowComponents(row =>
        row.addComponents(
          new ButtonBuilder()
            .setCustomId("rekrutacja_button")
            .setLabel("︲Kliknij, aby stworzyć podanie o sprzedawcę!")
            .setEmoji("💡")
            .setStyle(ButtonStyle.Secondary)
        )
      )
      .addSeparatorComponents(s => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(t =>
        t.setContent("-# <:tidallogo:1500523012653584456> © 2026 TidalMark3t™  » Legitny sklep × Rekrutacja")
      );

    const container2 = new ContainerBuilder()
      .setAccentColor(0x5865F2)
      .addTextDisplayComponents(t =>
        t.setContent("# ```                   ℹ️︲τɩᴅᴀʟᴍᴀʀᴋɛᴛ™ × ɪɴꜰᴏ```")
      )
      .addSeparatorComponents(s => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(t =>
        t.setContent(
`### <:pin:1500517574960611519>︲__Co Wymagamy?__

<a:strzalka:1500519151150567475> ︲**Kaucja 1:1,** **\`czyli jeżeli chcesz np. Limit 50zł to\`**
**\`wpłacasz 50zł do właściciela.\`** _Jest to zabezpieczenie przed scamerami_.

<a:strzalka:1500519151150567475> ︲**7% od zysku,** **\`np. zarobiłeś w tygodniu 150zł, to płacisz\`**
**\`10,5zł do właściciela.\`** _jest to mała kwota, więc większość zarobków idzie do ciebie, na_
_większości shopów wpłacasz od 15 - 30% ze swoich zarobków!_`
        )
      )
      .addSeparatorComponents(s => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(t =>
        t.setContent(
`### <:inne:1500517752304304178>︲__Co Oferujemy?__

<a:strzalka:1500519151150567475> ︲**Duże zarobkii!,** **\`Nawet do 100zł Profitu TYGODNIOWO!\`**

<a:strzalka:1500519151150567475> ︲**Budowanie reputacji jako Sprzedawca!** **\`Jeżeli kiedyś chciałbyś\`**
**\`zostać sprzedawcą gdzieś indziej, to ludzie będą wiedzieli że mogą tobie zaufać!\`**

<a:strzalka:1500519151150567475> ︲**Dużą ilość ticketów!** **\`oferujemy dużą ilość zamówień!\`**`
        )
      )
      .addSeparatorComponents(s => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small));

    return interaction.reply({
      components: [container1, container2],
      flags: flagsComponents
    });
  }

  if (interaction.commandName === "legitcheck") {
    await interaction.reply({ content: "✅ Panel ustawiony!", ephemeral: true });
    return refreshLegitPanel(interaction.channel);
  }

  if (interaction.commandName === "panelklienta") {
    const menu = new StringSelectMenuBuilder()
      .setCustomId("panel_select")
      .setPlaceholder("💡︲Wybierz opcję którą jesteś zainteresowany!")
      .addOptions([
        {
          label: "Twoje statystyki",
          description: "Sprawdź ile wydałeś u nas!",
          value: "stats",
          emoji: { id: "1500518106714603720" }
        },
        {
          label: "Historia Zakupów",
          description: "zobacz ostatnie transakcje!",
          value: "history",
          emoji: { id: "1500536149498659069" }
        },
        {
          label: "Topka",
          description: "Ranking największych klientów!",
          value: "top",
          emoji: { id: "1500517574960611519" }
        },
        {
          label: "Przenieś rangi",
          description: "Przenieś dane na nowe konto!",
          value: "transfer",
          emoji: { id: "1502287348413497385" }
        }
      ]);

    const container = new ContainerBuilder()
      .setAccentColor(0x5865F2)
      .addTextDisplayComponents(t =>
        t.setContent("# ```                   🌊︲τɩᴅᴀʟᴍᴀʀᴋɛᴛ™ × ᴘɑɴᴇʟ ᴋʟɩɛɴᴛɑ```")
      )
      .addSeparatorComponents(s => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(t =>
        t.setContent(
`> <:p0rtf3l:1502287348413497385>**︲Jesteś ciekaw** ile wydɑłeś **u nas** swojej __kaski__? Albo **__interesuje cie__** topka **naszych** __wspaniałych__ klɩɛntów?

> -# <a:strzalka:1500519151150567475>**︲Wybierz** opcje **którą __jesteś zainteresowany__**, poniżej!`
        )
      )
      .addSeparatorComponents(s => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addActionRowComponents(row => row.addComponents(menu))
      .addSeparatorComponents(s => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(t =>
        t.setContent("-# <:tidallogo:1500523012653584456>  © 2026 TɩdɑlMarket × Pɑnɛl Klɩɛntɑ")
      );

    return interaction.reply({
      components: [container],
      flags: flagsComponents
    });
  }

  if (interaction.commandName === "dodajzakup") {
    const user = interaction.options.getUser("uzytkownik");
    const amount = interaction.options.getNumber("kwota");

    createUser(user.id);
    database[user.id].spent += amount;
    database[user.id].history.unshift({ amount, date: Date.now() });
    database[user.id].history = database[user.id].history.slice(0, 5);
    saveData();

    const member = await interaction.guild.members.fetch(user.id);
    await updateRanks(member, database[user.id].spent);

    return interaction.reply({
      content: `✅ Dodano ${amount.toFixed(2)} PLN dla ${user}`,
      ephemeral: true
    });
  }

  if (interaction.commandName === "cennik") {
    const menu = new StringSelectMenuBuilder()
      .setCustomId("cennik_main")
      .setPlaceholder("💡︲Wybierz Interesującą Cię Kategorię Cennika!")
      .addOptions([
        {
          label: "Anarchia.gg",
          value: "anarchia",
          emoji: { id: "1501543051145908424" }
        },
        {
          label: "Donutsmp",
          value: "donut",
          emoji: { id: "1500518307705655498" }
        }
      ]);

    const container = new ContainerBuilder()
      .setAccentColor(0x2b2d31)
      .addTextDisplayComponents(t =>
        t.setContent("# ```                 🌊︲ᴛɪᴅᴀʟᴍᴀʀᴋᴇᴛ™ × ᴄᴇɴɴɪᴋɪ            ```")
      )
      .addSeparatorComponents(s => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(t =>
        t.setContent(
`> <:k0szyk:1501211663284572284>**︲Potrzebne** __**itemki**__ na serwer? Lub **jakaś** kaska? Bądź interesują __cię nasze__ TOPOWE
 ceny? Obczaj!

> -# <a:strzalka:1500519151150567475>**︲Wybierz** pr𝚘dukt, którym jesteś **zainteresowany**!`
        )
      )
      .addSeparatorComponents(s => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addActionRowComponents(row => row.addComponents(menu))
      .addSeparatorComponents(s => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(t =>
        t.setContent("-# <:tidallogo:1500523012653584456>  © 2026 TɩdalMark3t × Cɛnnɩkɩ")
      );

    return interaction.reply({
      components: [container],
      flags: flagsComponents
    });
  }

  if (interaction.commandName === "kalkulator") {
    const container = new ContainerBuilder()
      .setAccentColor(0x2b2d31)
      .addTextDisplayComponents(t =>
        t.setContent("# ```                   🌊︲τɩᴅᴀʟᴍᴀʀᴋɛᴛ™ × ᴋɑʟᴋᴜʟᴀᴛᴏʀ```")
      )
      .addSeparatorComponents(s => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(t =>
        t.setContent(
`> <:Wymiana:1501310946444968038>**︲Chcesz zobaczyć Ile kasy dostaniesz za zakup kaski** __na danym serwerze?__ **a może chcesz obliczyć ile dostaniesz** __za sprzedaż?__

> -# <a:strzalka:1500519151150567475>︲Wybierz jedną z opcjii poniżej, aby nasz bot to obliczył!`
        )
      )
      .addSeparatorComponents(s => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addActionRowComponents(row =>
        row.addComponents(
          new ButtonBuilder()
            .setCustomId("calc_open")
            .setLabel("︲Kliknij, aby obliczyć kasę za zakup/sprzedaż!")
            .setEmoji("1500536149498659069")
            .setStyle(ButtonStyle.Secondary)
        )
      )
      .addSeparatorComponents(s => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(t =>
        t.setContent("-# <:tidallogo:1500523012653584456> © 2026 TidalMark3t™  » Legitny sklep × Kalkulator")
      );

    return interaction.reply({
      components: [container],
      flags: flagsComponents
    });
  }
}

async function handleButton(interaction) {
  if (interaction.customId === "regulamin_open") {
    return interaction.reply({
      components: [buildRegulaminPage(1)],
      flags: flagsComponentsEphemeral
    });
  }

  if (interaction.customId.startsWith("regulamin_next_") || interaction.customId.startsWith("regulamin_prev_")) {
    const page = Number(interaction.customId.split("_").pop());
    return interaction.update({
      components: [buildRegulaminPage(page)]
    });
  }

  if (interaction.customId === "drop_roll") {
    await interaction.deferReply({ ephemeral: true });

    const member = interaction.member;

    if (!member.roles.cache.has(IDS.drop.role)) {
      return interaction.editReply({
        content: "❌ Musisz mieć status `.gg/tidalmarket`!"
      });
    }

    const last = dropCooldown.get(member.id);
    const now = Date.now();

    if (last && now - last < 21600000) {
      const left = 21600000 - (now - last);
      const hours = Math.floor(left / 3600000);

      const container = new ContainerBuilder()
        .setAccentColor(0x2b2d31)
        .addTextDisplayComponents(t =>
          t.setContent("# ```                 🕓︲ᴛɪᴅᴀʟᴍᴀʀᴋᴇᴛ™ × ᴄᴏᴏʟᴅᴏᴡɴ            ```")
        )
        .addSeparatorComponents(s => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(t =>
          t.setContent(
`> <:info:1500536149498659069>︲**Ej panie! Gdzie pan? Nie śpiesz się tak! Jeszcze nie możesz wylosować
> słodkiej nagrody za darmo!

> <a:strzalka:1500519151150567475>︲Poczekaj jeszcze \`${hours}h\`,  aby wylosować swoją
> nagrodę!`
          )
        )
        .addSeparatorComponents(s => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(t =>
          t.setContent("-# <:tidallogo:1500523012653584456>  © 2026 Tidalmark3t × Drop")
        );

      return interaction.editReply({
        components: [container],
        flags: flagsComponents
      });
    }

    dropCooldown.set(member.id, now);

    const rand = Math.random() * 100;
    let reward = null;

    if (rand <= 1) reward = "Kaska na anarchia LF - 15k";
    else if (rand <= 6) reward = "Zniżka 5%";
    else if (rand <= 16) reward = "Zniżka 2%";
    else if (rand <= 19) reward = "Kaska na anarchia LF - 5k";

    if (!reward) {
      const container = new ContainerBuilder()
        .setAccentColor(0x2b2d31)
        .addTextDisplayComponents(t =>
          t.setContent("# ```                 ❌︲ᴛɪᴅᴀʟᴍᴀʀᴋᴇᴛ™ × ᴘʀᴢᴇɢʀᴀɴᴀ            ```")
        )
        .addSeparatorComponents(s => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(t =>
          t.setContent(
`> <:prez3nt:1502016024973676645>**︲__Nieeeeeeeee!__ Niestety, ale tym razem ci się nie udało! Może
> następnym razem...

> <:info:1500536149498659069>︲Spróboj swojego szczęścia ponownie __następnym razem__ za \`6h\`.`
          )
        )
        .addSeparatorComponents(s => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(t =>
          t.setContent("-# <:tidallogo:1500523012653584456>  © 2026 Tidalmark3t × Drop")
        );

      return interaction.editReply({
        components: [container],
        flags: flagsComponents
      });
    }

    const container = new ContainerBuilder()
      .setAccentColor(0x2b2d31)
      .addTextDisplayComponents(t =>
        t.setContent("# ```                 ✅︲ᴛɪᴅᴀʟᴍᴀʀᴋᴇᴛ™ × ᴡʏɢʀᴀɴᴀ!            ```")
      )
      .addSeparatorComponents(s => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(t =>
        t.setContent(
`> <:prez3nt:1502016024973676645>︲__POLSKA, MAMY TOO!!!__ Udało ci się wygrać nagrodę *wiedziałem, że*
> *h*zαrd odda!*

> <a:strzalka:1500519151150567475>︲Wygrana: \`${reward}\`

> <:info:1500536149498659069>︲oraz można jeszcze raz __spróbować __ za \`6h\`! *Swiat jest piękny..*. Oraz zgłoś
> się na stw𝚘rzˑtɩckɛtα , aby odebrać nagrodę.`
        )
      )
      .addSeparatorComponents(s => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(t =>
        t.setContent("-# <:tidallogo:1499384354940387509>  © 2026 Tidalmark3t × Drop")
      );

    return interaction.editReply({
      components: [container],
      flags: flagsComponents
    });
  }

  if (interaction.customId === "verify_button") {
    const num1 = Math.floor(Math.random() * 10) + 1;
    const num2 = Math.floor(Math.random() * 10) + 1;
    const answer = num1 * num2;

    mathQuestions.set(interaction.user.id, answer);

    const modal = new ModalBuilder()
      .setCustomId("verify_modal")
      .setTitle("Weryfikacja");

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("answer")
          .setLabel(`Ile to ${num1} × ${num2}?`)
          .setStyle(TextInputStyle.Short)
      )
    );

    return interaction.showModal(modal);
  }

  if (interaction.customId === "join_giveaway") {
    const giveaway = giveaways.get(interaction.message.id);

    if (!giveaway) {
      return interaction.reply({
        content: "❌ Konkurs zakończony!",
        ephemeral: true
      });
    }

    if (giveaway.users.includes(interaction.user.id)) {
      return interaction.reply({
        content: "❌ Już bierzesz udział!",
        ephemeral: true
      });
    }

    giveaway.users.push(interaction.user.id);
    const joinedCount = giveaway.users.length;

    const joinButton = new ButtonBuilder()
      .setCustomId("join_giveaway")
      .setLabel("︲Kliknij, aby dołączyć do konkursu!")
      .setEmoji("1502016024973676645")
      .setStyle(ButtonStyle.Secondary);

    const joinedButton = new ButtonBuilder()
      .setCustomId("joined_count")
      .setLabel(`︲W Konkursie wzięło udział ${joinedCount} osób!`)
      .setEmoji("1500533612653838577")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true);

    const container = new ContainerBuilder()
      .setAccentColor(0x5865F2)
      .addTextDisplayComponents(t =>
        t.setContent("# ```                   🌊︲τɩᴅᴀʟᴍᴀʀᴋɛᴛ™ × ᴋᴏɴᴋᴜʀꜱ```")
      )
      .addSeparatorComponents(s => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(t =>
        t.setContent(
`> <:prez3nt:1502016024973676645>︲**Nagrodą** W __Konkursie__ Jest: \`${giveaway.reward}\`
> <:ludzie:1500533612653838577>︲**__Nagrodę Może__** Wygrać: \`${giveaway.winnersCount}\`!
> <:kalendarz:1500518163564068964>︲**Koniec:** <t:${giveaway.endTimestamp}:R> **(<t:${giveaway.endTimestamp}:F>)**`
        )
      )
      .addSeparatorComponents(s => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addActionRowComponents(row => row.addComponents(joinButton, joinedButton))
      .addSeparatorComponents(s => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(t =>
        t.setContent("-# <:tidallogo:1500523012653584456>  © 2026 TɩdɑlMarket × Konkurs")
      );

    return interaction.update({
      components: [container]
    });
  }

  if (interaction.customId === "rekrutacja_button") {
    const modal = new ModalBuilder()
      .setCustomId("rekrutacja_modal")
      .setTitle("Rekrutacja");

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("why")
          .setLabel("Dlaczego chcesz zostać sprzedawcą?")
          .setStyle(TextInputStyle.Paragraph)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("about")
          .setLabel("Opowiedz nam coś o sobie.")
          .setStyle(TextInputStyle.Paragraph)
      )
    );

    return interaction.showModal(modal);
  }

  if (interaction.customId === "ticket_settings_button") {
    if (!interaction.member.roles.cache.has(IDS.ticket.sellerRole)) {
      return interaction.reply({
        content: "❌ Nie masz permisji!",
        ephemeral: true
      });
    }

    const menu = new StringSelectMenuBuilder()
      .setCustomId("ticket_settings_select")
      .setPlaceholder("💡︲Wybierz Interesującą Cię Kategorie Ustawień!")
      .addOptions([
        { label: "Przenieś na kategorię Zrealizowane", value: "move", emoji: { id: "1500517574960611519" } },
        { label: "Zmień nazwę ticketa", value: "rename", emoji: { id: "1501310946444968038" } },
        { label: "Dodaj Użytkownika", value: "add", emoji: { id: "1501309836942377121" } },
        { label: "Usuń Użytkownika", value: "remove", emoji: { id: "1501309909294383416" } },
        { label: "Przejmij Ticketa", value: "claim", emoji: { id: "1500517574960611519" } }
      ]);

    return interaction.reply({
      components: [new ActionRowBuilder().addComponents(menu)],
      ephemeral: true
    });
  }

  if (interaction.customId === "ticket_close_button") {
    if (
      interaction.channel.parentId === IDS.ticket.categoryZakup ||
      interaction.channel.parentId === IDS.ticket.categoryClaimed
    ) {
      const container = new ContainerBuilder()
        .setAccentColor(0x2b2d31)
        .addTextDisplayComponents(t =>
          t.setContent("# ```                 🌊︲ᴛɪᴅᴀʟᴍᴀʀᴋᴇᴛ™ × ᴢᴀᴛᴡɪᴇʀᴅᴢ ᴘʀᴢᴇʙɪᴇɢ           ```")
        )
        .addSeparatorComponents(s => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(t =>
          t.setContent(
`<a:strzalka:1500519151150567475>︲Czy sprzedaż przeszła pomyślnie? jeżeli tak to wybierz
**__zrealizowanie__** po czym uzupełnij rubrykę.
<a:strzalka:1500519151150567475>︲Jeżeli nie sprzedałeś, wybierz opcję **__Nie zrealizowane__**.`
          )
        )
        .addSeparatorComponents(s => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addActionRowComponents(row =>
          row.addComponents(
            new ButtonBuilder().setCustomId("ticket_done_yes").setLabel("Zrealizowane").setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId("ticket_done_no").setLabel("Nie zrealizowane").setStyle(ButtonStyle.Secondary)
          )
        )
        .addSeparatorComponents(s => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(t =>
          t.setContent("-# <:tidallogo:1500523012653584456> © 2026 TidalMark3t™  » Legitny sklep × sprzedaz/zakup")
        );

      return interaction.reply({
        components: [container],
        flags: flagsComponents
      });
    }

    await interaction.reply({ content: "🔒 Zamykam...", ephemeral: true });
    setTimeout(() => interaction.channel.delete().catch(() => {}), 3000);
    return;
  }

  if (interaction.customId === "ticket_done_no") {
    await interaction.reply({ content: "❌ Zamykam...", ephemeral: true });
    setTimeout(() => interaction.channel.delete().catch(() => {}), 3000);
    return;
  }

  if (interaction.customId === "ticket_done_yes") {
    const modal = new ModalBuilder()
      .setCustomId("ticket_sale_modal")
      .setTitle("Sprzedaż");

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("kwota")
          .setLabel("Za ile PLN sprzedałeś? (0 = skup)")
          .setStyle(TextInputStyle.Short)
      )
    );

    return interaction.showModal(modal);
  }

  if (interaction.customId === "rekrutacja_settings_button") {
    if (!interaction.member.roles.cache.has(IDS.rekrutacja.staffRole)) {
      return interaction.reply({
        content: "❌ Nie masz permisji!",
        ephemeral: true
      });
    }

    const menu = new StringSelectMenuBuilder()
      .setCustomId("rekrutacja_settings_select")
      .setPlaceholder("💡︲Wybierz Interesującą Cię Kategorie Ustawień!")
      .addOptions([
        { label: "Przenieś na kategorię Zrealizowane", value: "move", emoji: { id: "1500517574960611519" } },
        { label: "Zmień nazwę ticketa", value: "rename", emoji: { id: "1501310946444968038" } },
        { label: "Dodaj Użytkownika", value: "add", emoji: { id: "1501309836942377121" } },
        { label: "Usuń Użytkownika", value: "remove", emoji: { id: "1501309909294383416" } }
      ]);

    return interaction.reply({
      components: [new ActionRowBuilder().addComponents(menu)],
      ephemeral: true
    });
  }

  if (interaction.customId === "rekrutacja_close_button") {
    await interaction.reply({
      content: "🔒 Zamykam ticket...",
      ephemeral: true
    });

    setTimeout(() => {
      interaction.channel.delete().catch(() => {});
    }, 3000);

    return;
  }

  if (interaction.customId === "calc_open") {
    const menu = new StringSelectMenuBuilder()
      .setCustomId("calc_server_select")
      .setPlaceholder("💡︲Wybierz serwer!")
      .addOptions([
        { label: "Anarchia.GG", value: "anarchia", emoji: "1501543051145908424" },
        { label: "DonutSMP.net", value: "donut", emoji: "1500518307705655498" }
      ]);

    return interaction.reply({
      content: "### Wybierz serwer!",
      components: [new ActionRowBuilder().addComponents(menu)],
      ephemeral: true
    });
  }
}

async function handleSelectMenu(interaction) {
  if (interaction.customId === "ticket_select") {
    const type = interaction.values[0];
    const modal = new ModalBuilder()
      .setCustomId(`ticket_form_${type}`)
      .setTitle("Ticket");

    let inputs = [];

    if (type === "zakup") {
      const menu = new StringSelectMenuBuilder()
        .setCustomId("ticket_buy_server")
        .setPlaceholder("💡︲Wybierz serwer!")
        .addOptions([
          { label: "Anarchia.gg", value: "anarchia", emoji: { id: "1501543051145908424" } },
          { label: "Donutsmp.net", value: "donut", emoji: { id: "1500518307705655498" } }
        ]);

      return interaction.reply({
        components: [new ActionRowBuilder().addComponents(menu)],
        ephemeral: true
      });
    }

    if (type === "pytanie") {
      inputs = [
        new TextInputBuilder().setCustomId("pyt").setLabel("Jakie masz pytanie?").setStyle(TextInputStyle.Paragraph)
      ];
    }

    if (type === "inne") {
      inputs = [
        new TextInputBuilder().setCustomId("inne").setLabel("Opisz sprawę").setStyle(TextInputStyle.Paragraph)
      ];
    }

    if (type === "sprzedaz") {
      inputs = [
        new TextInputBuilder().setCustomId("ile").setLabel("Ile kasy chcesz sprzedać?").setStyle(TextInputStyle.Short),
        new TextInputBuilder().setCustomId("serwer").setLabel("Jaki serwer i tryb?").setStyle(TextInputStyle.Short)
      ];
    }

    modal.addComponents(...inputs.map(i => new ActionRowBuilder().addComponents(i)));
    return interaction.showModal(modal);
  }

  if (interaction.customId === "ticket_settings_select") {
    const val = interaction.values[0];

    if (val === "move") {
      await interaction.channel.setParent(IDS.ticket.categoryDone);
      return interaction.reply({ content: "✅ Przeniesiono!", ephemeral: true });
    }

    if (val === "rename") {
      const modal = new ModalBuilder().setCustomId("ticket_rename_modal").setTitle("Zmień nazwę");
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId("name").setLabel("Zmień nazwę kanału").setStyle(TextInputStyle.Short)
        )
      );
      return interaction.showModal(modal);
    }

    if (val === "add") {
      const modal = new ModalBuilder().setCustomId("ticket_add_modal").setTitle("Dodaj użytkownika");
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId("user").setLabel("Wpisz TAG użytkownika").setStyle(TextInputStyle.Short)
        )
      );
      return interaction.showModal(modal);
    }

    if (val === "remove") {
      const modal = new ModalBuilder().setCustomId("ticket_remove_modal").setTitle("Usuń użytkownika");
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId("user").setLabel("Wpisz TAG użytkownika").setStyle(TextInputStyle.Short)
        )
      );
      return interaction.showModal(modal);
    }

    if (val === "claim") {
      if (!interaction.member.roles.cache.has(IDS.ticket.sellerRole)) {
        return interaction.reply({
          content: "❌ Nie masz permisji!",
          ephemeral: true
        });
      }

      const userId = interaction.channel.permissionOverwrites.cache
        .filter(p => p.type === 1 && p.id !== interaction.guild.id && p.id !== IDS.ticket.sellerRole)
        .first()?.id;

      await interaction.channel.setParent(IDS.ticket.categoryClaimed);
      await interaction.channel.permissionOverwrites.set([
        {
          id: interaction.guild.id,
          deny: [PermissionsBitField.Flags.ViewChannel]
        },
        {
          id: interaction.user.id,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages
          ]
        },
        {
          id: userId,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages
          ]
        }
      ]);

      return interaction.reply({
        content: "✅ Przejęto ticket!",
        ephemeral: true
      });
    }
  }

  if (interaction.customId === "ticket_buy_server") {
    const val = interaction.values[0];

    if (val === "donut") {
      const paymentMenu = new StringSelectMenuBuilder()
        .setCustomId("ticket_payment_donut")
        .setPlaceholder("💡︲Wybierz metodę płatności!")
        .addOptions([
          { label: "Blik", value: "blik", emoji: { id: "1500517807404617859" } },
          { label: "LTC", value: "ltc", emoji: { id: "1500517896374452244" } },
          { label: "Revolut", value: "revolut", emoji: { id: "1501546418719035452" } },
          { label: "Kod Blik", value: "kodblik", emoji: { id: "1500517807404617859" } },
          { label: "MyPSC", value: "mypsc", emoji: { id: "1500517224148897892" } },
          { label: "PSC", value: "psc", emoji: { id: "1500518038867542026" } },
          { label: "Inne Crypto", value: "crypto", emoji: { id: "1500517991417385155" } }
        ]);

      return interaction.update({
        components: [new ActionRowBuilder().addComponents(paymentMenu)]
      });
    }

    if (val === "anarchia") {
      const menu = new StringSelectMenuBuilder()
        .setCustomId("ticket_buy_anarchia_mode")
        .setPlaceholder("💡︲Wybierz tryb!")
        .addOptions([
          { label: "lifesteal", value: "lifesteal", emoji: { id: "1501543818095366246" } },
          { label: "boxpvp", value: "boxpvp", emoji: { id: "1501543635466977391" } }
        ]);

      return interaction.update({
        components: [new ActionRowBuilder().addComponents(menu)]
      });
    }
  }

  if (interaction.customId === "ticket_buy_anarchia_mode") {
    const mode = interaction.values[0];

    const paymentMenu = new StringSelectMenuBuilder()
      .setCustomId(`ticket_payment_${mode}`)
      .setPlaceholder("💡︲Wybierz metodę płatności!")
      .addOptions([
        { label: "Blik", value: "blik", emoji: { id: "1500517807404617859" } },
        { label: "LTC", value: "ltc", emoji: { id: "1500517896374452244" } },
        { label: "Revolut", value: "revolut", emoji: { id: "1501546418719035452" } },
        { label: "Kod Blik", value: "kodblik", emoji: { id: "1500517807404617859" } },
        { label: "MyPSC", value: "mypsc", emoji: { id: "1500517224148897892" } },
        { label: "PSC", value: "psc", emoji: { id: "1500518038867542026" } },
        { label: "Inne Crypto", value: "crypto", emoji: { id: "1500517991417385155" } }
      ]);

    return interaction.update({
      components: [new ActionRowBuilder().addComponents(paymentMenu)]
    });
  }

  if (interaction.customId.startsWith("ticket_payment_")) {
    const payment = interaction.values[0];
    const mode = interaction.customId.replace("ticket_payment_", "");

    ticketPaymentData.set(interaction.user.id, { payment, mode });

    const modal = new ModalBuilder()
      .setCustomId(`ticket_buy_${mode}`)
      .setTitle("Zakup");

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId("cash").setLabel("Ile kasy chcesz zakupić?").setStyle(TextInputStyle.Short)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId("pln").setLabel("Wartość produktów w PLN").setStyle(TextInputStyle.Short)
      )
    );

    return interaction.showModal(modal);
  }

  if (interaction.customId === "rekrutacja_settings_select") {
    const val = interaction.values[0];

    if (val === "move") {
      await interaction.channel.setParent(IDS.rekrutacja.categoryDone);
      return interaction.reply({
        content: "✅ Przeniesiono!",
        ephemeral: true
      });
    }

    if (val === "rename") {
      const modal = new ModalBuilder().setCustomId("rekrutacja_rename_modal").setTitle("Zmień nazwę");
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId("name").setLabel("Nowa nazwa kanału").setStyle(TextInputStyle.Short)
        )
      );
      return interaction.showModal(modal);
    }

    if (val === "add") {
      const modal = new ModalBuilder().setCustomId("rekrutacja_add_modal").setTitle("Dodaj użytkownika");
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId("user").setLabel("Podaj username").setStyle(TextInputStyle.Short)
        )
      );
      return interaction.showModal(modal);
    }

    if (val === "remove") {
      const modal = new ModalBuilder().setCustomId("rekrutacja_remove_modal").setTitle("Usuń użytkownika");
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId("user").setLabel("Podaj username").setStyle(TextInputStyle.Short)
        )
      );
      return interaction.showModal(modal);
    }
  }

  if (interaction.customId === "panel_select" && interaction.values[0] === "stats") {
    createUser(interaction.user.id);
    const spent = database[interaction.user.id].spent;
    const member = await interaction.guild.members.fetch(interaction.user.id);
    const rank = getCurrentRank(member);
    const next = getNextRank(spent);

    const container = new ContainerBuilder()
      .setAccentColor(0x5865F2)
      .addTextDisplayComponents(t =>
        t.setContent(
`# \`\`\`                   🌊︲τɩᴅᴀʟᴍᴀʀᴋɛᴛ™ × ꜱᴛɑᴛʏꜱᴛʏᴋɩ\`\`\`

<a:strzalka:1500519151150567475>︲Wydałeś u nas: ${spent.toFixed(2)} PLN

<a:strzalka:1500519151150567475>︲Twoja aktualna ranga: ${rank}
<a:strzalka:1500519151150567475>︲Do następnej potrzebujesz: ${
next ? `${next.needed} PLN` : "Masz najwyższą rangę"
}

<:tidallogo:1500523012653584456> © 2026 TidalMarket × Twoje Statystyki • ${formatNow()}`
        )
      );

    return interaction.reply({
      components: [container],
      flags: flagsComponentsEphemeral
    });
  }

  if (interaction.customId === "panel_select" && interaction.values[0] === "history") {
    createUser(interaction.user.id);
    const history = database[interaction.user.id].history;
    let text = "";

    if (history.length === 0) {
      text = "> Brak transakcji";
    } else {
      history.forEach((h, i) => {
        const timestamp = Math.floor(h.date / 1000);
        text += `> Transakcja nr. ${i + 1}︲${h.amount.toFixed(2)} PLN (<t:${timestamp}:F>)\n\n`;
      });
    }

    const container = new ContainerBuilder()
      .setAccentColor(0x5865F2)
      .addTextDisplayComponents(t =>
        t.setContent(
`# \`\`\`                   🌊︲τɩᴅᴀʟᴍᴀʀᴋɛᴛ™ × ʜɩꜱᴛᴏʀɪɑ ᴛᴡᴏɪᴄʜ ᴢᴀᴋᴜᴘóᴡ\`\`\`

<a:strzalka:1500519151150567475>︲Oto **twoje 5 ostatnich** __transakcjii__

${text}

<:tidallogo:1500523012653584456> © 2026 TidalMarket × Historia zakupów • ${formatNow()}`
        )
      );

    return interaction.reply({
      components: [container],
      flags: flagsComponentsEphemeral
    });
  }

  if (interaction.customId === "panel_select" && interaction.values[0] === "top") {
    const top = Object.entries(database)
      .sort((a, b) => b[1].spent - a[1].spent)
      .slice(0, 10);

    let text = "";

    if (top.length === 0) {
      text = "> Brak danych";
    } else {
      top.forEach((u, i) => {
        text += `> ${i + 1}. ︲<@${u[0]}> <a:strzalka:1500519151150567475> ${u[1].spent.toFixed(2)} PLN\n\n`;
      });
    }

    const container = new ContainerBuilder()
      .setAccentColor(0x5865F2)
      .addTextDisplayComponents(t =>
        t.setContent(
`# \`\`\`                   🌊︲τɩᴅᴀʟᴍᴀʀᴋɛᴛ™ × ᴛᴏᴘᴋɑ\`\`\`

${text}`
        )
      );

    return interaction.reply({
      components: [container],
      flags: flagsComponentsEphemeral
    });
  }

  if (interaction.customId === "panel_select" && interaction.values[0] === "transfer") {
    const modal = new ModalBuilder()
      .setCustomId("panel_transfer_modal")
      .setTitle("Przenieś rangi");

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId("id").setLabel("Wpisz ID konta").setStyle(TextInputStyle.Short)
      )
    );

    return interaction.showModal(modal);
  }

  if (interaction.customId === "cennik_main") {
    if (interaction.values[0] === "anarchia") {
      const menu = new StringSelectMenuBuilder()
        .setCustomId("cennik_ana")
        .setPlaceholder("💡︲Wybierz Interesujący cię tryb Anarchii")
        .addOptions([
          { label: "Anarchia LF", value: "lf", emoji: { id: "1501543818095366246" } },
          { label: "Anarchia BOX", value: "box", emoji: { id: "1501543635466977391" } }
        ]);

      return interaction.reply({
        components: [new ActionRowBuilder().addComponents(menu)],
        ephemeral: true
      });
    }

    if (interaction.values[0] === "donut") {
      const container = new ContainerBuilder()
        .setAccentColor(0x2b2d31)
        .addTextDisplayComponents(t =>
          t.setContent("# ```                 🌊︲ᴛɪᴅᴀʟᴍᴀʀᴋᴇᴛ™ ᴅᴏɴᴜᴛꜱᴍᴘ            ```")
        )
        .addTextDisplayComponents(t =>
          t.setContent(
`> <a:b4g:1502037458773217360>**︲5.5MLN Waluty** Serwerowej
> <:stck:1500517347193262251>︲Serwer: **DonutSMP.net**
> <a:m0ney:1397708163456827463>︲**Cɛnα: 1 PLN**
> <:k0morn1k:1500517316704604281>︲Tryb: *crystals (jedyny)*`
          )
        );

      return interaction.reply({
        components: [container],
        flags: flagsComponentsEphemeral
      });
    }
  }

  if (interaction.customId === "cennik_ana") {
    if (interaction.values[0] === "lf") {
      const container = new ContainerBuilder()
        .setAccentColor(0x2b2d31)
        .addTextDisplayComponents(t =>
          t.setContent("# ```                 🌊︲ᴛɪᴅᴀʟᴍᴀʀᴋᴇᴛ™ × ᴀɴᴀ ʟꜰ            ```")
        )
        .addTextDisplayComponents(t =>
          t.setContent(
`> <a:b4g:1502037458773217360>**︲7.000 Waluty** Serwerowej
> <:stck:1500517347193262251>︲Serwer: **Anarchia.GG**
> <a:m0ney:1397708163456827463>︲**Cɛnα: 1 PLN**
> <:k0morn1k:1500517316704604281>︲Tryb: *LifeSteal*`
          )
        );

      return interaction.reply({
        components: [container],
        flags: flagsComponentsEphemeral
      });
    }

    if (interaction.values[0] === "box") {
      const container = new ContainerBuilder()
        .setAccentColor(0x2b2d31)
        .addTextDisplayComponents(t =>
          t.setContent("# ```                 🌊︲ᴛɪᴅᴀʟᴍᴀʀᴋᴇᴛ™ × ᴀɴᴀ ʙᴏx            ```")
        )
        .addTextDisplayComponents(t =>
          t.setContent(
`> <a:b4g:1502037458773217360>**︲750,000 Waluty** Serwerowej
> <:stck:1500517347193262251>︲Serwer: **Anarchia.GG**
> <a:m0ney:1397708163456827463>︲**Cɛnα: 1 PLN**
> <:k0morn1k:1500517316704604281>︲Tryb: *BoxPVP*`
          )
        );

      return interaction.reply({
        components: [container],
        flags: flagsComponentsEphemeral
      });
    }
  }

  if (interaction.customId === "calc_server_select") {
    const value = interaction.values[0];

    if (value === "anarchia") {
      const menu = new StringSelectMenuBuilder()
        .setCustomId("calc_anarchia_mode")
        .setPlaceholder("💡︲Wybierz tryb!")
        .addOptions([
          { label: "Lifesteal", value: "lifesteal", emoji: "1501543818095366246" },
          { label: "BoxPVP", value: "boxpvp", emoji: "1501543635466977391" }
        ]);

      return interaction.update({
        content: "### Wybierz tryb!",
        components: [new ActionRowBuilder().addComponents(menu)]
      });
    }

    if (value === "donut") {
      const modal = new ModalBuilder()
        .setCustomId("calc_donut_modal")
        .setTitle("DonutSMP.net");

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId("pln").setLabel("Podaj ilość waluty PLN").setStyle(TextInputStyle.Short)
        )
      );

      return interaction.showModal(modal);
    }
  }

  if (interaction.customId === "calc_anarchia_mode") {
    const value = interaction.values[0];

    if (value === "lifesteal") {
      const modal = new ModalBuilder()
        .setCustomId("calc_lifesteal_modal")
        .setTitle("Lifesteal");

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId("pln").setLabel("Podaj ilość waluty PLN").setStyle(TextInputStyle.Short)
        )
      );

      return interaction.showModal(modal);
    }

    if (value === "boxpvp") {
      const modal = new ModalBuilder()
        .setCustomId("calc_boxpvp_modal")
        .setTitle("BoxPVP");

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId("pln").setLabel("Podaj ilość waluty PLN").setStyle(TextInputStyle.Short)
        )
      );

      return interaction.showModal(modal);
    }
  }
}

async function handleModal(interaction) {
  if (interaction.customId === "verify_modal") {
    const answer = interaction.fields.getTextInputValue("answer");
    const correct = mathQuestions.get(interaction.user.id);

    if (Number(answer) !== correct) {
      return interaction.reply({
        content: "❌ Złe działanie!",
        ephemeral: true
      });
    }

    const member = await interaction.guild.members.fetch(interaction.user.id);
    await member.roles.add(IDS.verify.role);
    mathQuestions.delete(interaction.user.id);

    return interaction.reply({
      content: "✅ Zweryfikowano pomyślnie!",
      ephemeral: true
    });
  }

  if (interaction.customId === "konkurs_modal") {
    const reward = interaction.fields.getTextInputValue("reward");
    const winnersCount = parseInt(interaction.fields.getTextInputValue("winners"), 10);
    const days = parseInt(interaction.fields.getTextInputValue("days"), 10);
    const endDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    const endTimestamp = Math.floor(endDate.getTime() / 1000);

    const joinButton = new ButtonBuilder()
      .setCustomId("join_giveaway")
      .setLabel("︲Kliknij, aby dołączyć do konkursu!")
      .setEmoji("1502016024973676645")
      .setStyle(ButtonStyle.Secondary);

    const joinedButton = new ButtonBuilder()
      .setCustomId("joined_count")
      .setLabel("︲W Konkursie wzięło udział 0 osób!")
      .setEmoji("1500533612653838577")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true);

    const container = new ContainerBuilder()
      .setAccentColor(0x5865F2)
      .addTextDisplayComponents(t =>
        t.setContent("# ```                   🌊︲τɩᴅᴀʟᴍᴀʀᴋɛᴛ™ × ᴋᴏɴᴋᴜʀꜱ```")
      )
      .addSeparatorComponents(s => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(t =>
        t.setContent(
`> <:prez3nt:1502016024973676645>︲**Nagrodą** W __Konkursie__ Jest: \`${reward}\`
> <:ludzie:1500533612653838577>︲**__Nagrodę Może__** Wygrać: \`${winnersCount}\`!
> <:kalendarz:1500518163564068964>︲**Koniec:** <t:${endTimestamp}:R> **(<t:${endTimestamp}:F>)**`
        )
      )
      .addSeparatorComponents(s => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addActionRowComponents(row => row.addComponents(joinButton, joinedButton))
      .addSeparatorComponents(s => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(t =>
        t.setContent("-# <:tidallogo:1500523012653584456>  © 2026 TɩdɑlMarket × Konkurs")
      );

    const msg = await interaction.reply({
      components: [container],
      flags: flagsComponents,
      fetchReply: true
    });

    giveaways.set(msg.id, {
      reward,
      winnersCount,
      users: [],
      endTimestamp,
      channelId: interaction.channel.id
    });

    setTimeout(async () => {
      const data = giveaways.get(msg.id);
      if (!data) return;

      const channel = await client.channels.fetch(data.channelId);
      let winners = [];

      if (data.users.length > 0) {
        const shuffled = [...data.users].sort(() => 0.5 - Math.random());
        winners = shuffled.slice(0, data.winnersCount);
      }

      const winnersText = winners.length > 0 ? winners.map(id => `<@${id}>`).join(", ") : "Nikt";
      const date = formatNow();

      const winnerContainer = new ContainerBuilder()
        .setAccentColor(0x5865F2)
        .addTextDisplayComponents(t =>
          t.setContent(
`### <:prez3nt:1502016024973676645>︲Zakończono konkurs!

**Gratulujemy ${winnersText},**
**${winnersText}! Zgłoś(-cie) się** na <#${IDS.konkurs.ticketChannelId}> w __tickecie__ po
**odbiór nagrody**!

:copyright: 2026 TɩdɑlMɑrket × Gratulujemy • ${date}`
          )
        );

      await channel.send({
        components: [winnerContainer],
        flags: flagsComponents
      });

      giveaways.delete(msg.id);
    }, days * 24 * 60 * 60 * 1000);

    return;
  }

  if (interaction.customId === "rekrutacja_modal") {
    await interaction.deferReply({ ephemeral: true });

    const why = interaction.fields.getTextInputValue("why");
    const about = interaction.fields.getTextInputValue("about");

    const channel = await interaction.guild.channels.create({
      name: `📄〢rekrutacjaˑ${safeUsername(interaction.user.username)}`,
      type: ChannelType.GuildText,
      parent: IDS.rekrutacja.category,
      permissionOverwrites: [
        {
          id: interaction.guild.id,
          deny: [PermissionsBitField.Flags.ViewChannel]
        },
        {
          id: interaction.user.id,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages
          ]
        },
        {
          id: IDS.rekrutacja.staffRole,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages
          ]
        }
      ]
    });

    await channel.send(`||<@&${IDS.rekrutacja.staffRole}>||`);

    const container = new ContainerBuilder()
      .setAccentColor(0x5865F2)
      .addSectionComponents(section =>
        section
          .addTextDisplayComponents(t =>
            t.setContent(
`### <:uzytkownik:1500518106714603720>︲Informacje O Użytkowniku:

> ・<a:strzalka:1500519151150567475>︲**Ping:** ${interaction.user}
> ・<a:strzalka:1500519151150567475>︲**TAG:** \`${interaction.user.username}\`
> ・<a:strzalka:1500519151150567475>︲**ID Użytkownika:** \`${interaction.user.id}\`

### <:info:1500536149498659069>︲Podanie Rekrutacyjne:

> ・<a:strzalka:1500519151150567475>︲**Dlaczego chcesz zostać sprzedawcą?**
\`${why}\`
> ・<a:strzalka:1500519151150567475>︲**Opowiedz nam coś o sobie**
\`${about}\`

-# <:tidallogo:1500523012653584456> © 2026 TidalMarket × Rekrutacja`
            )
          )
          .setThumbnailAccessory(a => a.setURL(interaction.user.displayAvatarURL({ size: 256 })))
      );

    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("rekrutacja_close_button")
        .setLabel("︲Zamknij Ticketa")
        .setEmoji("1500517511257653388")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("rekrutacja_settings_button")
        .setLabel("︲Ustawienia")
        .setEmoji("1501301585186258955")
        .setStyle(ButtonStyle.Secondary)
    );

    await channel.send({
      components: [container],
      flags: flagsComponents
    });

    await channel.send({
      components: [buttons]
    });

    return interaction.editReply({
      content: `✅ Utworzono podanie! ${channel}`
    });
  }

  if (interaction.customId.startsWith("ticket_form_") || interaction.customId.startsWith("ticket_buy_")) {
    await interaction.deferReply({ ephemeral: true });

    let type = interaction.customId.replace("ticket_form_", "");
    if (interaction.customId.startsWith("ticket_buy_")) {
      type = "zakup";
    }

    let parent = IDS.ticket.categoryInne;
    if (type === "zakup") parent = IDS.ticket.categoryZakup;
    if (type === "pytanie") parent = IDS.ticket.categoryPytania;
    if (type === "sprzedaz") parent = IDS.ticket.categorySprzedaz;

    let channelName = `❗〢inneˑ${safeUsername(interaction.user.username)}`;
    if (type === "zakup") channelName = `🛒〢zakupˑ${safeUsername(interaction.user.username)}`;
    if (type === "pytanie") channelName = `❓〢pytanieˑ${safeUsername(interaction.user.username)}`;
    if (type === "sprzedaz") channelName = `💸〢sprzedazˑ${safeUsername(interaction.user.username)}`;

    let channel;

    try {
      channel = await interaction.guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent,
        permissionOverwrites: [
          { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
          { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
          { id: IDS.ticket.sellerRole, allow: [PermissionsBitField.Flags.ViewChannel] }
        ]
      });
    } catch (error) {
      console.error("❌ Ticket create error:", error);
      return interaction.editReply({
        content: "❌ Bot nie ma permisji do tworzenia kanałów!"
      });
    }

    await channel.send(`||<@&${IDS.ticket.sellerRole}>||`);

    let payment = "";
    let pln = "";
    let serverName = "";
    let modeName = "";
    let cashAmount = "";
    let tresc = "";
    let serwer = "";
    let ile = "";

    if (interaction.customId === "ticket_buy_donut") {
      payment = ticketPaymentData.get(interaction.user.id)?.payment || "Brak";
      pln = interaction.fields.getTextInputValue("pln");
      cashAmount = interaction.fields.getTextInputValue("cash");
      serverName = "DonutSMP.net";
      modeName = "Crystal";
    }

    if (interaction.customId === "ticket_buy_lifesteal") {
      payment = ticketPaymentData.get(interaction.user.id)?.payment || "Brak";
      pln = interaction.fields.getTextInputValue("pln");
      cashAmount = interaction.fields.getTextInputValue("cash");
      serverName = "Anarchia.gg";
      modeName = "LifeSteal";
    }

    if (interaction.customId === "ticket_buy_boxpvp") {
      payment = ticketPaymentData.get(interaction.user.id)?.payment || "Brak";
      pln = interaction.fields.getTextInputValue("pln");
      cashAmount = interaction.fields.getTextInputValue("cash");
      serverName = "Anarchia.gg";
      modeName = "BoxPVP";
    }

    if (type === "pytanie") {
      tresc = interaction.fields.getTextInputValue("pyt");
    } else if (type === "inne") {
      tresc = interaction.fields.getTextInputValue("inne");
    } else if (type === "sprzedaz") {
      tresc = interaction.fields.getTextInputValue("ile");
      serwer = interaction.fields.getTextInputValue("serwer");
      ile = interaction.fields.getTextInputValue("ile");
    }

    const ticketId = Math.random().toString(36).substring(2, 10);
    const date = formatNow();

    const details = type === "zakup"
      ? `
> ・<a:strzalka:1500519151150567475>︲**Mɛt𝚘dɑ Płɑτn𝚘ścɩ:** \`${payment}\`
> ・<a:strzalka:1500519151150567475>︲**Wɑrt𝚘ść w PLN:** \`${pln}\`
> ・<a:strzalka:1500519151150567475>︲**Sɛrwɛr:** \`${serverName}\`
> ・<a:strzalka:1500519151150567475>︲**Tryb:** \`${modeName}\`
> ・<a:strzalka:1500519151150567475>︲**ɩl𝚘ść kɑsy:** \`${cashAmount}\``
      : type === "sprzedaz"
        ? `
> ・<a:strzalka:1500519151150567475>︲**Ilość kasy:** \`${ile}\`
> ・<a:strzalka:1500519151150567475>︲**Jaki serwer i tryb?:** \`${serwer}\``
        : `
> ・<a:strzalka:1500519151150567475>︲**Treść Pomocy:** \`${tresc}\``;

    const container = new ContainerBuilder()
      .setAccentColor(0x5865F2)
      .addSectionComponents(section =>
        section
          .addTextDisplayComponents(t =>
            t.setContent(
`### <:uzytkownik:1500518106714603720>︲Informacje O Użytkowniku:
> ・<a:strzalka:1500519151150567475>︲**Ping:** ${interaction.user}
> ・<a:strzalka:1500519151150567475>︲**TAG:** \`${interaction.user.username}\`
> ・<a:strzalka:1500519151150567475>︲**ID Użytkownika:** \`${interaction.user.id}\`
### <:info:1500536149498659069>︲Informacje o Tickecie:
> ・<a:strzalka:1500519151150567475>︲**ID Ticketa:** \`${ticketId}\`
> ・<a:strzalka:1500519151150567475>︲**Kategoria Ticketa:** \`${type}\`${details}
-# <:tidallogo:1500523012653584456> © 2026 TidalMarket × Pomoc • ${date}`
            )
          )
          .setThumbnailAccessory(a => a.setURL(interaction.user.displayAvatarURL({ size: 256 })))
      );

    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("ticket_close_button")
        .setLabel("︲Zamknij Ticketa")
        .setEmoji("1500517511257653388")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("ticket_settings_button")
        .setLabel("︲Ustawienia")
        .setEmoji("1501301585186258955")
        .setStyle(ButtonStyle.Secondary)
    );

    await channel.send({
      components: [container],
      flags: flagsComponents
    });

    await channel.send({
      components: [buttons]
    });

    ticketPaymentData.delete(interaction.user.id);

    return interaction.editReply({
      content: `✅ ${channel}`
    });
  }

  if (interaction.customId === "ticket_sale_modal") {
    await interaction.deferReply({ ephemeral: true });

    const amount = interaction.fields.getTextInputValue("kwota");

    if (!/^\d+$/.test(amount)) {
      return interaction.editReply({ content: "❌ Podaj liczbę!" });
    }

    const user = interaction.user;
    const member = await interaction.guild.members.fetch(user.id);

    if (!member.roles.cache.has(IDS.ticket.verifiedRole)) {
      await member.roles.add(IDS.ticket.verifiedRole).catch(() => {});
    }

    let count = salesCount.get(user.id) || 0;
    count++;
    salesCount.set(user.id, count);

    let total = salesTotal.get(user.id) || 0;
    total += Number(amount);
    salesTotal.set(user.id, total);

    addMoney(Number(amount));

    let channel = interaction.guild.channels.cache.find(
      c => c.parentId === IDS.ticket.categorySales && c.name === `〢💸︲sprzedaneˑ${user.username}`
    );

    if (!channel) {
      channel = await interaction.guild.channels.create({
        name: `〢💸︲sprzedaneˑ${user.username}`,
        type: ChannelType.GuildText,
        parent: IDS.ticket.categorySales
      });
    }

    const container = new ContainerBuilder()
      .setAccentColor(0x2b2d31)
      .addTextDisplayComponents(t =>
        t.setContent("# ```                 🌊︲ᴛɪᴅᴀʟᴍᴀʀᴋᴇᴛ™ × ꜱᴘʀᴢᴇᴅᴀɴᴀ ᴋᴀꜱᴀ            ```")
      )
      .addSeparatorComponents(s => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(t =>
        t.setContent(
`〢<a:strzalka:1500519151150567475>・ sprzedawca : ${user.username}
〢<a:strzalka:1500519151150567475>・ID sprzedawcy : ${user.id}
〢<a:strzalka:1500519151150567475>・kwota : \`${amount}\`
〢<a:strzalka:1500519151150567475>・liczba transakcjii : \`${count}\`
〢<a:strzalka:1500519151150567475>・PLN'y zebrane : \`${total}\``
        )
      )
      .addSeparatorComponents(s => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(t =>
        t.setContent("-# <:tidallogo:1500523012653584456>  © 2026 TidalMark3t™ × sprzɛdana kaska")
      );

    await channel.send({
      components: [container],
      flags: flagsComponents
    });

    await interaction.editReply({ content: "✅ Zapisano sprzedaż!" });
    setTimeout(() => interaction.channel.delete().catch(() => {}), 3000);
    return;
  }

  if (interaction.customId === "ticket_rename_modal") {
    const name = interaction.fields.getTextInputValue("name");
    await interaction.channel.setName(name);
    return interaction.reply({ content: "✅ Zmieniono nazwę!", ephemeral: true });
  }

  if (interaction.customId === "ticket_add_modal") {
    const tag = interaction.fields.getTextInputValue("user");
    const member = interaction.guild.members.cache.find(
      u => u.user.username === tag || u.user.tag === tag
    );

    if (!member) {
      return interaction.reply({ content: "❌ Nie znaleziono", ephemeral: true });
    }

    await interaction.channel.permissionOverwrites.edit(member.id, {
      ViewChannel: true,
      SendMessages: true
    });

    return interaction.reply({ content: "✅ Dodano!", ephemeral: true });
  }

  if (interaction.customId === "ticket_remove_modal") {
    const tag = interaction.fields.getTextInputValue("user");
    const member = interaction.guild.members.cache.find(
      u => u.user.username === tag || u.user.tag === tag
    );

    if (!member) {
      return interaction.reply({ content: "❌ Nie znaleziono", ephemeral: true });
    }

    await interaction.channel.permissionOverwrites.delete(member.id);
    return interaction.reply({ content: "✅ Usunięto!", ephemeral: true });
  }

  if (interaction.customId === "rekrutacja_rename_modal") {
    const name = interaction.fields.getTextInputValue("name");
    await interaction.channel.setName(name);
    return interaction.reply({
      content: "✅ Zmieniono nazwę!",
      ephemeral: true
    });
  }

  if (interaction.customId === "rekrutacja_add_modal") {
    const tag = interaction.fields.getTextInputValue("user");
    const member = interaction.guild.members.cache.find(
      u => u.user.username === tag || u.user.tag === tag
    );

    if (!member) {
      return interaction.reply({
        content: "❌ Nie znaleziono użytkownika!",
        ephemeral: true
      });
    }

    await interaction.channel.permissionOverwrites.edit(member.id, {
      ViewChannel: true,
      SendMessages: true
    });

    return interaction.reply({
      content: "✅ Dodano użytkownika!",
      ephemeral: true
    });
  }

  if (interaction.customId === "rekrutacja_remove_modal") {
    const tag = interaction.fields.getTextInputValue("user");
    const member = interaction.guild.members.cache.find(
      u => u.user.username === tag || u.user.tag === tag
    );

    if (!member) {
      return interaction.reply({
        content: "❌ Nie znaleziono użytkownika!",
        ephemeral: true
      });
    }

    await interaction.channel.permissionOverwrites.delete(member.id);
    return interaction.reply({
      content: "✅ Usunięto użytkownika!",
      ephemeral: true
    });
  }

  if (interaction.customId === "panel_transfer_modal") {
    const targetId = interaction.fields.getTextInputValue("id");
    let target;

    try {
      target = await interaction.guild.members.fetch(targetId);
    } catch {
      return interaction.reply({
        content: "❌ Nie znaleziono użytkownika!",
        ephemeral: true
      });
    }

    const member = await interaction.guild.members.fetch(interaction.user.id);

    for (const rank of RANKS) {
      if (member.roles.cache.has(rank.role)) {
        await target.roles.add(rank.role).catch(() => {});
        await member.roles.remove(rank.role).catch(() => {});
      }
    }

    createUser(interaction.user.id);
    createUser(target.id);
    database[target.id] = database[interaction.user.id];
    database[interaction.user.id] = { spent: 0, history: [] };
    saveData();

    return interaction.reply({
      content: `✅ Przeniesiono rangi i dane na ${target}`,
      ephemeral: true
    });
  }

  if (interaction.customId === "calc_lifesteal_modal") {
    const pln = Number(interaction.fields.getTextInputValue("pln"));
    const result = pln * 7000;

    const container = new ContainerBuilder()
      .setAccentColor(0x2b2d31)
      .addTextDisplayComponents(t =>
        t.setContent(
`# \`\`\`                   🌊︲τɩᴅᴀʟᴍᴀʀᴋɛᴛ™ × ᴋɑʟᴋᴜʟᴀᴛᴏʀ\`\`\`

<:k0morn1k:1500517316704604281>︲Na serwerze : \`Anarchia.GG\`
<:stck:1500517347193262251>︲Tryb: \`Lifesteal\`
<a:b4g:1502037458773217360>︲Produkt: \`7000zł - 1zł\`
<a:m0ney:1397708163456827463>︲Za \`${pln} PLN\` dostaniesz: \`${result.toLocaleString()} Waluty serwerowej\``
        )
      );

    return interaction.reply({
      components: [container],
      flags: flagsComponentsEphemeral
    });
  }

  if (interaction.customId === "calc_boxpvp_modal") {
    const pln = Number(interaction.fields.getTextInputValue("pln"));
    const result = pln * 750000;

    const container = new ContainerBuilder()
      .setAccentColor(0x2b2d31)
      .addTextDisplayComponents(t =>
        t.setContent(
`# \`\`\`                   🌊︲τɩᴅᴀʟᴍᴀʀᴋɛᴛ™ × ᴋɑʟᴋᴜʟᴀᴛᴏʀ\`\`\`

<:k0morn1k:1500517316704604281>︲Na serwerze : \`Anarchia.GG\`
<:stck:1500517347193262251>︲Tryb: \`BoxPVP\`
<a:b4g:1502037458773217360>︲Produkt: \`750,000 - 1zł\`
<a:m0ney:1397708163456827463>︲Za \`${pln} PLN\` dostaniesz: \`${result.toLocaleString()} Waluty serwerowej\``
        )
      );

    return interaction.reply({
      components: [container],
      flags: flagsComponentsEphemeral
    });
  }

  if (interaction.customId === "calc_donut_modal") {
    const pln = Number(interaction.fields.getTextInputValue("pln"));
    const result = pln * 5500000;

    const container = new ContainerBuilder()
      .setAccentColor(0x2b2d31)
      .addTextDisplayComponents(t =>
        t.setContent(
`# \`\`\`                   🌊︲τɩᴅᴀʟᴍᴀʀᴋɛᴛ™ × ᴋɑʟᴋᴜʟᴀᴛᴏʀ\`\`\`

<:k0morn1k:1500517316704604281>︲Na serwerze : \`DonutSMP.net\`
<:stck:1500517347193262251>︲Tryb: \`Crystal\`
<a:b4g:1502037458773217360>︲Produkt: \`5,500,000 - 1zł\`
<a:m0ney:1397708163456827463>︲Za \`${pln} PLN\` dostaniesz: \`${result.toLocaleString()} Waluty serwerowej\``
        )
      );

    return interaction.reply({
      components: [container],
      flags: flagsComponentsEphemeral
    });
  }
}

client.once("ready", () => {
  console.log(`🔥 ${client.user.tag}`);
  scheduleDailyStats();
});

client.on("guildMemberAdd", async member => {
  const channel = member.guild.channels.cache.get(IDS.welcome.channel);
  if (!channel) return;

  const memberCount = member.guild.memberCount;

  const container = new ContainerBuilder()
    .setAccentColor(0x2b2d31)
    .addTextDisplayComponents(t =>
      t.setContent("# ```                   🌊︲τɩᴅɑʟᴍᴀʀᴋɛᴛ™ × p𝚘wɩτalnɩɑ```")
    )
    .addSeparatorComponents(s => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(t =>
      t.setContent(
`> <:uzytkownik:1500518106714603720>**︲Witaj** ${member}, na serwerze \`Tidalmarket\`
> <:info:1500536149498659069>**︲Zapoznaj się z naszym** regulaminem na <#1397676952915283998>
> <:prez3nt:1502016024973676645>**︲*ejj, psst!*** obczaj <#1405224262767345704> - może __**czeka tam na ciebie free kaska!**__`
      )
    )
    .addSeparatorComponents(s => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small))
    .addActionRowComponents(r =>
      r.addComponents(
        new ButtonBuilder()
          .setCustomId("member_count")
          .setLabel(`︲Jesteś naszą ${memberCount} osobą!`)
          .setEmoji("1500518106714603720")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true)
      )
    )
    .addSeparatorComponents(s => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(t =>
      t.setContent("-# <:tidallogo:1500523012653584456> © 2026 Tidalmark3t × powitalnia")
    );

  await channel.send({
    components: [container],
    flags: flagsComponents
  });
});

client.on("presenceUpdate", async (_oldPresence, newPresence) => {
  if (!newPresence || !newPresence.member) return;

  const member = newPresence.member;
  const hasStatus = newPresence.activities.some(a =>
    a.state?.includes(".gg/tidalmarket") ||
    a.name?.includes(".gg/tidalmarket")
  );

  if (hasStatus) {
    if (!member.roles.cache.has(IDS.drop.role)) {
      await member.roles.add(IDS.drop.role).catch(() => {});
    }
  } else if (member.roles.cache.has(IDS.drop.role)) {
    await member.roles.remove(IDS.drop.role).catch(() => {});
  }
});

client.on("messageCreate", async message => {
  if (message.channel.id !== IDS.legitcheck.channel) return;
  if (message.author.bot) return;

  if (message.content.startsWith("+rep")) {
    const match = message.channel.name.match(/(\d+)$/);
    if (match) {
      const number = parseInt(match[1], 10) + 1;
      const newName = message.channel.name.replace(/\d+$/, `${number}`);
      await message.channel.setName(newName).catch(() => {});
    }
  }

  await refreshLegitPanel(message.channel);
});

client.on("messageReactionAdd", async (reaction, user) => {
  if (user.bot) return;

  if (reaction.partial) {
    await reaction.fetch().catch(() => {});
  }

  if (reaction.emoji.id !== IDS.czyLegit.noEmoji) return;

  const member = await reaction.message.guild.members.fetch(user.id).catch(() => null);
  if (!member) return;

  if (member.roles.cache.has(IDS.czyLegit.bypassRole)) {
    return;
  }

  await member.timeout(
    7 * 24 * 60 * 60 * 1000,
    "Fałszywa reakcja 'nie legit'"
  ).catch(() => {});

  try {
    await user.send("❌ Otrzymałeś przerwę na 7 dni za zaznaczenie reakcji 'nie legit' bez dowodu.");
  } catch {}
});

client.on("interactionCreate", async interaction => {
  try {
    if (interaction.isChatInputCommand()) {
      return await handleSlashCommand(interaction);
    }

    if (interaction.isButton()) {
      return await handleButton(interaction);
    }

    if (interaction.isStringSelectMenu()) {
      return await handleSelectMenu(interaction);
    }

    if (interaction.isModalSubmit()) {
      return await handleModal(interaction);
    }
  } catch (error) {
    console.error(error);

    const payload = {
      content: "❌ Wystąpił błąd podczas obsługi tej akcji.",
      ephemeral: true
    };

    if (interaction.replied || interaction.deferred) {
      return interaction.followUp(payload).catch(() => {});
    }

    return interaction.reply(payload).catch(() => {});
  }
});

registerCommands()
  .then(() => console.log("✅ Komendy załadowane"))
  .catch(console.error);

client.login(TOKEN);
