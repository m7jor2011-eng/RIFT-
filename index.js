const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  Events
} = require("discord.js");

const fs = require("fs");
const path = require("path");
const http = require("http");

/* =====================================================
   الإعدادات
===================================================== */

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const PORT = Number(process.env.PORT || 3000);

if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
  throw new Error(
    "يجب إضافة DISCORD_TOKEN و CLIENT_ID و GUILD_ID في Environment Variables."
  );
}

/* =====================================================
   قاعدة البيانات
===================================================== */

const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "database.json");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

let database = {
  users: {},
  tickets: {}
};

if (fs.existsSync(DATA_FILE)) {
  try {
    database = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch {
    database = {
      users: {},
      tickets: {}
    };
  }
}

if (!database.users) database.users = {};
if (!database.tickets) database.tickets = {};

function saveDatabase() {
  fs.writeFileSync(
    DATA_FILE,
    JSON.stringify(database, null, 2),
    "utf8"
  );
}

/* =====================================================
   المستخدم
===================================================== */

function getUser(userId) {
  if (!database.users[userId]) {
    database.users[userId] = {
      points: 0,
      hours: 0,
      achievements: 0,
      evidence: 0,
      coins: 0,
      history: [],
      rewards: []
    };

    saveDatabase();
  }

  return database.users[userId];
}

/* =====================================================
   المستويات
===================================================== */

const LEVELS = [
  {
    level: 1,
    name: "عضو",
    points: 0,
    reward: "لا توجد مكافأة مالية"
  },
  {
    level: 2,
    name: "عضو موثوق",
    points: 10,
    reward: "2,000 ريال داخل الرول بلاي"
  },
  {
    level: 3,
    name: "عضو خبير",
    points: 25,
    reward: "5,000 ريال داخل الرول بلاي"
  },
  {
    level: 4,
    name: "عضو متقدم",
    points: 45,
    reward: "أولوية في الإسعاف"
  },
  {
    level: 5,
    name: "عضو متميز",
    points: 70,
    reward: "أولوية في وزارة العدل"
  },
  {
    level: 6,
    name: "عضو نخبة",
    points: 105,
    reward: "أولوية في العسكر"
  },
  {
    level: 7,
    name: "عضو أسطوري",
    points: 150,
    reward: "مكافأة مالية أسبوعية"
  },
  {
    level: 8,
    name: "عضو متفوق",
    points: 205,
    reward: "لوحة مركبة من اختيار اللاعب"
  },
  {
    level: 9,
    name: "عضو استثنائي",
    points: 275,
    reward: "مركبة من اختيار اللاعب"
  },
  {
    level: 10,
    name: "شيخ",
    points: 360,
    reward: "رتبة شيخ ومميزاتها"
  }
];

function getLevel(points) {
  let current = LEVELS[0];

  for (const level of LEVELS) {
    if (points >= level.points) {
      current = level;
    }
  }

  return current;
}

function getNextLevel(points) {
  return LEVELS.find(level => level.points > points) || null;
}

function formatHours(hours) {
  const minutes = Math.round(Number(hours || 0) * 60);

  const h = Math.floor(minutes / 60);
  const m = minutes % 60;

  if (h === 0) {
    return `${m} دقيقة`;
  }

  if (m === 0) {
    return `${h} ساعة`;
  }

  return `${h} ساعة و${m} دقيقة`;
}

/* =====================================================
   السجل
===================================================== */

function addHistory(userId, action) {
  const user = getUser(userId);

  user.history.unshift({
    ...action,
    date: new Date().toISOString()
  });

  user.history = user.history.slice(0, 100);
}

/* =====================================================
   الأدلة
===================================================== */

function isValidEvidence(attachment) {
  if (!attachment) return false;

  const type = attachment.contentType || "";

  return (
    type.startsWith("image/") ||
    type.startsWith("video/")
  );
}

function addProof(
  userId,
  type,
  hours,
  evidenceUrl,
  description
) {
  const user = getUser(userId);

  const oldLevel = getLevel(user.points);

  let pointsAdded = 1;

  if (type === "hours") {
    pointsAdded = Math.max(
      1,
      Math.floor(Number(hours))
    );

    user.hours += Number(hours || 0);
  }

  if (type === "achievement") {
    user.achievements += 1;
    pointsAdded = 1;
  }

  if (type === "help") {
    pointsAdded = 1;
  }

  if (type === "game") {
    pointsAdded = 1;
  }

  user.points += pointsAdded;
  user.evidence += 1;

  addHistory(userId, {
    action: "رفع دليل",
    type,
    pointsAdded,
    hours: Number(hours || 0),
    evidence: evidenceUrl,
    description
  });

  const newLevel = getLevel(user.points);

  if (newLevel.level > oldLevel.level) {
    user.rewards.push({
      level: newLevel.level,
      reward: newLevel.reward,
      date: new Date().toISOString(),
      status: "مستحق"
    });

    addHistory(userId, {
      action: "ترقية مستوى",
      from: oldLevel.level,
      to: newLevel.level,
      reward: newLevel.reward,
      pointsAdded: 0
    });
  }

  saveDatabase();

  return {
    oldLevel,
    newLevel,
    pointsAdded
  };
}

/* =====================================================
   Embed ملف اللاعب
===================================================== */

function profileEmbed(user) {
  const data = getUser(user.id);

  const level = getLevel(data.points);
  const next = getNextLevel(data.points);

  return new EmbedBuilder()
    .setColor(0x111111)
    .setTitle("📋 ملف اللاعب")
    .setDescription(
      `اللاعب: ${user}\n\n` +
      `الرتبة الحالية: **${level.name}**`
    )
    .addFields(
      {
        name: "المستوى",
        value: String(level.level),
        inline: true
      },
      {
        name: "النقاط",
        value: String(data.points),
        inline: true
      },
      {
        name: "الساعات",
        value: formatHours(data.hours),
        inline: true
      },
      {
        name: "الإنجازات",
        value: String(data.achievements),
        inline: true
      },
      {
        name: "الأدلة",
        value: String(data.evidence),
        inline: true
      },
      {
        name: "المستوى التالي",
        value: next
          ? `${next.level} — ${next.points} نقطة`
          : "🏆 وصلت إلى أعلى مستوى",
        inline: true
      }
    )
    .setFooter({
      text: "RIFT TOWN • نظام المستويات"
    })
    .setTimestamp();
}

/* =====================================================
   Embed المستويات
===================================================== */

function levelsEmbed() {
  return new EmbedBuilder()
    .setColor(0x111111)
    .setTitle("🏆 المستويات والمكافآت")
    .setDescription(
      LEVELS.map(level =>
        `**المستوى ${level.level} — ${level.name}**\n` +
        `النقاط المطلوبة: **${level.points}**\n` +
        `المكافأة: ${level.reward}`
      ).join("\n\n")
    )
    .setFooter({
      text: "كل زيادة مستوى تكون تدريجية"
    });
}

/* =====================================================
   القوانين
===================================================== */

function rulesEmbed() {
  return new EmbedBuilder()
    .setColor(0x111111)
    .setTitle("📜 قوانين نظام المستويات")
    .setDescription(
      "**القانون 1 — الدليل**\n" +
      "يجب أن يكون الدليل صورة أو فيديو واضحًا.\n\n" +

      "**القانون 2 — صحة الدليل**\n" +
      "يجب أن يثبت الدليل التواجد أو مساعدة لاعب أو إنجازًا.\n\n" +

      "**القانون 3 — منع التكرار**\n" +
      "يمنع رفع نفس الدليل أكثر من مرة للحصول على نقاط إضافية.\n\n" +

      "**القانون 4 — الأدلة المزورة**\n" +
      "يمنع استخدام الأدلة المزورة أو المعدلة بهدف الحصول على نقاط.\n\n" +

      "**القانون 5 — زيادة المستوى**\n" +
      "زيادة اللفل تكون تدريجية، والمستويات الأعلى تحتاج نشاطًا أكثر.\n\n" +

      "**القانون 6 — مكافآت الجمعة**\n" +
      "المكافآت المالية الخاصة بالنظام يتم صرفها يوم الجمعة.\n\n" +

      "**القانون 7 — مستوى 8**\n" +
      "يفتح للاعب لوحة مركبة من اختياره حسب نظام السيرفر.\n\n" +

      "**القانون 8 — مستوى 9**\n" +
      "يفتح للاعب مركبة من اختياره حسب نظام السيرفر.\n\n" +

      "**القانون 9 — مستوى 10**\n" +
      "يفتح رتبة شيخ ومميزاتها.\n\n" +

      "**القانون 10 — إساءة الاستخدام**\n" +
      "إساءة استخدام نظام الأدلة قد تؤدي إلى إلغاء الاستفادة من النظام."
    );
}

/* =====================================================
   خيارات A B C للقوانين
===================================================== */

function rulesButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("rules_a")
        .setLabel("A • القوانين")
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId("rules_b")
        .setLabel("B • المكافآت")
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId("rules_c")
        .setLabel("C • طريقة اللفل")
        .setStyle(ButtonStyle.Secondary)
    )
  ];
}

function rulesAEmbed() {
  return new EmbedBuilder()
    .setColor(0x111111)
    .setTitle("A • القوانين")
    .setDescription(
      "1. ارفع دليلًا واضحًا.\n\n" +
      "2. الدليل يجب أن يثبت النشاط الحقيقي.\n\n" +
      "3. يمنع تكرار نفس الدليل.\n\n" +
      "4. يمنع تزوير الأدلة.\n\n" +
      "5. يمنع استغلال النظام للحصول على نقاط بطريقة غير مشروعة."
    );
}

function rulesBEmbed() {
  return new EmbedBuilder()
    .setColor(0x111111)
    .setTitle("B • المكافآت")
    .setDescription(
      "💰 المكافآت المالية يتم صرفها **كل يوم جمعة**.\n\n" +
      "المستوى 2: 2,000 ريال داخل الرول بلاي.\n\n" +
      "المستوى 3: 5,000 ريال داخل الرول بلاي.\n\n" +
      "المستوى 4: أولوية في الإسعاف.\n\n" +
      "المستوى 5: أولوية في وزارة العدل.\n\n" +
      "المستوى 6: أولوية في العسكر.\n\n" +
      "المستوى 8: لوحة من اختيار اللاعب.\n\n" +
      "المستوى 9: مركبة من اختيار اللاعب.\n\n" +
      "المستوى 10: رتبة شيخ ومميزاتها."
    );
}

function rulesCEmbed() {
  return new EmbedBuilder()
    .setColor(0x111111)
    .setTitle("C • طريقة زيادة اللفل")
    .setDescription(
      "📈 زيادة اللفل تكون تدريجية.\n\n" +
      "من المستوى 1 إلى 5: متوسطة إلى صعبة.\n\n" +
      "من المستوى 6 إلى 10: أصعب، لكن ليست مستحيلة.\n\n" +
      "يمكنك جمع النقاط من:\n" +
      "• مساعدة لاعب.\n" +
      "• التواجد في جيم.\n" +
      "• ساعات الرول بلاي.\n" +
      "• الإنجازات.\n" +
      "• الأدلة المقبولة."
    );
}

/* =====================================================
   المكافآت
===================================================== */

function rewardsEmbed() {
  return new EmbedBuilder()
    .setColor(0x111111)
    .setTitle("🎁 المكافآت")
    .setDescription(
      LEVELS
        .filter(level => level.level > 1)
        .map(level =>
          `**المستوى ${level.level}**\n${level.reward}`
        )
        .join("\n\n") +

      "\n\n💰 **المكافآت المالية تصرف يوم الجمعة.**\n" +
      "البوت يسجل الاستحقاق ولا يقوم بتحويل الأموال تلقائيًا."
    );
}

/* =====================================================
   المتجر
===================================================== */

function shopEmbed() {
  return new EmbedBuilder()
    .setColor(0x111111)
    .setTitle("🛒 المتجر")
    .setDescription(
      "متجر المكافآت والتجميل.\n\n" +
      "✨ عناصر تجميلية يمكن إضافتها للنظام لاحقًا.\n\n" +
      "🏷️ المستوى 8 يفتح لوحة من اختيارك.\n\n" +
      "🚗 المستوى 9 يفتح مركبة من اختيارك.\n\n" +
      "👑 المستوى 10 يفتح رتبة شيخ."
    );
}

/* =====================================================
   السجل
===================================================== */

function historyEmbed(user) {
  const data = getUser(user.id);

  if (!data.history.length) {
    return new EmbedBuilder()
      .setColor(0x111111)
      .setTitle("📖 السجل")
      .setDescription(
        "لا يوجد لديك نشاط مسجل حتى الآن."
      );
  }

  return new EmbedBuilder()
    .setColor(0x111111)
    .setTitle("📖 سجل اللاعب")
    .setDescription(
      data.history
        .slice(0, 10)
        .map((item, index) =>
          `${index + 1}. **${item.action}**\n` +
          `النقاط: ${item.pointsAdded || 0}\n` +
          `الوصف: ${item.description || "بدون وصف"}`
        )
        .join("\n\n")
    );
}

/* =====================================================
   المتصدرون
===================================================== */

function leaderboardEmbed(guild) {
  const players = Object.entries(database.users)
    .sort((a, b) => b[1].points - a[1].points)
    .slice(0, 10);

  if (!players.length) {
    return new EmbedBuilder()
      .setColor(0x111111)
      .setTitle("🏆 المتصدرون")
      .setDescription(
        "لا توجد بيانات حتى الآن."
      );
  }

  const text = players
    .map(([id, data], index) => {
      const member = guild.members.cache.get(id);

      const name = member
        ? member.displayName
        : `<@${id}>`;

      const level = getLevel(data.points);

      return (
        `**${index + 1}. ${name}** — ` +
        `المستوى ${level.level} — ` +
        `${data.points} نقطة`
      );
    })
    .join("\n");

  return new EmbedBuilder()
    .setColor(0x111111)
    .setTitle("🏆 المتصدرون")
    .setDescription(text);
}

/* =====================================================
   الإحصائيات
===================================================== */

function statsEmbed() {
  const users = Object.values(database.users);

  const totalHours = users.reduce(
    (sum, user) => sum + Number(user.hours || 0),
    0
  );

  const totalProofs = users.reduce(
    (sum, user) => sum + Number(user.evidence || 0),
    0
  );

  const totalAchievements = users.reduce(
    (sum, user) => sum + Number(user.achievements || 0),
    0
  );

  return new EmbedBuilder()
    .setColor(0x111111)
    .setTitle("📊 إحصائيات النظام")
    .addFields(
      {
        name: "عدد اللاعبين",
        value: String(users.length),
        inline: true
      },
      {
        name: "إجمالي الساعات",
        value: formatHours(totalHours),
        inline: true
      },
      {
        name: "إجمالي الأدلة",
        value: String(totalProofs),
        inline: true
      },
      {
        name: "إجمالي الإنجازات",
        value: String(totalAchievements),
        inline: true
      }
    );
}

/* =====================================================
   اللوحة الرئيسية
===================================================== */

function mainButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("profile")
        .setLabel("ملفي")
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId("levels")
        .setLabel("المستويات")
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId("leaderboard")
        .setLabel("المتصدرون")
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId("rules")
        .setLabel("القوانين")
        .setStyle(ButtonStyle.Secondary)
    ),

    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("rewards")
        .setLabel("المكافآت")
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId("shop")
        .setLabel("المتجر")
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId("history")
        .setLabel("السجل")
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId("stats")
        .setLabel("الإحصائيات")
        .setStyle(ButtonStyle.Secondary)
    )
  ];
}

/* =====================================================
   لوحة التفعيل
===================================================== */

function setupEmbed() {
  return new EmbedBuilder()
    .setColor(0x111111)
    .setTitle("⚡ RIFT TOWN")
    .setDescription(
      "مرحبًا بك في نظام المستويات والمكافآت.\n\n" +
      "استخدم الأزرار بالأسفل لمعرفة مستواك ومكافآتك وقوانين النظام."
    )
    .setFooter({
      text: "RIFT TOWN • نظام المستويات"
    })
    .setTimestamp();
}

function setupButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("setup_profile")
        .setLabel("تفعيل حسابي")
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId("setup_rules")
        .setLabel("القوانين")
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId("setup_levels")
        .setLabel("المستويات")
        .setStyle(ButtonStyle.Secondary)
    )
  ];
}

/* =====================================================
   لوحة التكتات
===================================================== */

function ticketsEmbed() {
  return new EmbedBuilder()
    .setColor(0x111111)
    .setTitle("🎫 التكتات")
    .setDescription(
      "اضغط على الزر المناسب لفتح تكت.\n\n" +
      "🆘 **الدعم الفني**\n" +
      "للمشاكل والاستفسارات التقنية.\n\n" +
      "📈 **الترقية**\n" +
      "للاستفسار عن اللفل والترقية.\n\n" +
      "🎁 **المكافآت**\n" +
      "للاستفسار عن المكافآت."
    );
}

function ticketsButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("ticket_support")
        .setLabel("الدعم الفني")
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId("ticket_level")
        .setLabel("الترقية")
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId("ticket_reward")
        .setLabel("المكافآت")
        .setStyle(ButtonStyle.Success)
    )
  ];
}

/* =====================================================
   أوامر Slash
===================================================== */

const commands = [

  new SlashCommandBuilder()
    .setName("setup")
    .setDescription("إرسال لوحة تفعيل الحساب"),

  new SlashCommandBuilder()
    .setName("tickets")
    .setDescription("إدارة لوحة التكتات")
    .addSubcommand(sub =>
      sub
        .setName("setup")
        .setDescription("إرسال لوحة التكتات")
    ),

  new SlashCommandBuilder()
    .setName("reputation")
    .setDescription("فتح نظام السمعة"),

  new SlashCommandBuilder()
    .setName("profile")
    .setDescription("عرض ملف اللاعب"),

  new SlashCommandBuilder()
    .setName("levels")
    .setDescription("عرض المستويات والمكافآت"),

  new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("عرض المتصدرين"),

  new SlashCommandBuilder()
    .setName("history")
    .setDescription("عرض سجل اللاعب"),

  new SlashCommandBuilder()
    .setName("rewards")
    .setDescription("عرض المكافآت"),

  new SlashCommandBuilder()
    .setName("shop")
    .setDescription("فتح المتجر"),

  new SlashCommandBuilder()
    .setName("rules")
    .setDescription("عرض القوانين"),

  new SlashCommandBuilder()
    .setName("stats")
    .setDescription("عرض إحصائيات النظام"),

  new SlashCommandBuilder()
    .setName("proof")
    .setDescription("رفع دليل وإضافة النقاط")

    .addStringOption(option =>
      option
        .setName("type")
        .setDescription("نوع الدليل")
        .setRequired(true)
        .addChoices(
          {
            name: "ساعات رول بلاي",
            value: "hours"
          },
          {
            name: "مساعدة لاعب",
            value: "help"
          },
          {
            name: "تواجد في جيم",
            value: "game"
          },
          {
            name: "إنجاز",
            value: "achievement"
          }
        )
    )

    .addNumberOption(option =>
      option
        .setName("hours")
        .setDescription("عدد الساعات")
        .setRequired(false)
        .setMinValue(0.5)
        .setMaxValue(24)
    )

    .addAttachmentOption(option =>
      option
        .setName("evidence")
        .setDescription("ارفع صورة أو فيديو للدليل")
        .setRequired(true)
    )

    .addStringOption(option =>
      option
        .setName("description")
        .setDescription("وصف الدليل")
        .setRequired(true)
        .setMaxLength(1000)
    )

].map(command => command.toJSON());

/* =====================================================
   Discord Client
===================================================== */

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds
  ]
});

/* =====================================================
   تسجيل الأوامر
===================================================== */

client.once(Events.ClientReady, async readyClient => {

  console.log(
    `تم تشغيل البوت: ${readyClient.user.tag}`
  );

  const rest = new REST({
    version: "10"
  }).setToken(TOKEN);

  try {

    console.log("جاري تسجيل أوامر Slash...");

    await rest.put(
      Routes.applicationGuildCommands(
        CLIENT_ID,
        GUILD_ID
      ),
      {
        body: commands
      }
    );

    console.log(
      `تم تسجيل ${commands.length} أمر Slash في السيرفر.`
    );

    console.log(
      "الأوامر أصبحت خاصة بالسيرفر وتظهر مباشرة."
    );

  } catch (error) {

    console.error(
      "فشل تسجيل أوامر Slash:",
      error
    );

  }
});

/* =====================================================
   التفاعلات
===================================================== */

client.on(
  Events.InteractionCreate,
  async interaction => {

    try {

      /* ===============================================
         أوامر Slash
      =============================================== */

      if (interaction.isChatInputCommand()) {

        switch (interaction.commandName) {

          case "setup":

            return interaction.reply({
              embeds: [
                setupEmbed()
              ],
              components: setupButtons()
            });

          case "tickets":

            if (
              interaction.options.getSubcommand() === "setup"
            ) {

              return interaction.reply({
                embeds: [
                  ticketsEmbed()
                ],
                components: ticketsButtons()
              });

            }

            break;

          case "reputation":

            return interaction.reply({
              embeds: [
                new EmbedBuilder()
                  .setColor(0x111111)
                  .setTitle("⚡ نظام السمعة")
                  .setDescription(
                    "استخدم الأزرار الموجودة أسفل الرسالة للوصول إلى النظام."
                  )
              ],
              components: mainButtons()
            });

          case "profile":

            return interaction.reply({
              embeds: [
                profileEmbed(interaction.user)
              ]
            });

          case "levels":

            return interaction.reply({
              embeds: [
                levelsEmbed()
              ]
            });

          case "leaderboard":

            return interaction.reply({
              embeds: [
                leaderboardEmbed(interaction.guild)
              ]
            });

          case "history":

            return interaction.reply({
              embeds: [
                historyEmbed(interaction.user)
              ],
              ephemeral: true
            });

          case "rewards":

            return interaction.reply({
              embeds: [
                rewardsEmbed()
              ]
            });

          case "shop":

            return interaction.reply({
              embeds: [
                shopEmbed()
              ]
            });

          case "rules":

            return interaction.reply({
              embeds: [
                rulesEmbed()
              ],
              components: rulesButtons()
            });

          case "stats":

            return interaction.reply({
              embeds: [
                statsEmbed()
              ]
            });

          case "proof": {

            const type =
              interaction.options.getString("type");

            const hours =
              interaction.options.getNumber("hours");

            const evidence =
              interaction.options.getAttachment("evidence");

            const description =
              interaction.options.getString("description");

            if (!isValidEvidence(evidence)) {

              return interaction.reply({
                content:
                  "❌ يجب رفع صورة أو فيديو فقط.",
                ephemeral: true
              });

            }

            if (
              type === "hours" &&
              (!hours || hours <= 0)
            ) {

              return interaction.reply({
                content:
                  "❌ يجب كتابة عدد الساعات.",
                ephemeral: true
              });

            }

            const result = addProof(
              interaction.user.id,
              type,
              hours,
              evidence.url,
              description
            );

            const levelUp =
              result.newLevel.level >
              result.oldLevel.level;

            return interaction.reply({

              embeds: [

                new EmbedBuilder()
                  .setColor(0x111111)
                  .setTitle("✅ تم تسجيل الدليل")

                  .setDescription(
                    `تم تسجيل الدليل بنجاح.\n\n` +

                    `النقاط المضافة: **${result.pointsAdded}**\n` +

                    `المستوى الحالي: **${result.newLevel.level}**` +

                    (
                      levelUp
                        ? `\n\n🎉 تمت ترقيتك من المستوى **${result.oldLevel.level}** إلى المستوى **${result.newLevel.level}**!`
                        : ""
                    )
                  )

                  .addFields({
                    name: "الدليل",
                    value:
                      `[فتح الدليل](${evidence.url})`
                  })

                  .setTimestamp()

              ],

              ephemeral: true
            });
          }

          default:

            return interaction.reply({
              content:
                "❌ الأمر غير معروف.",
              ephemeral: true
            });
        }
      }

      /* ===============================================
         الأزرار
      =============================================== */

      if (interaction.isButton()) {

        switch (interaction.customId) {

          /* لوحة النظام */

          case "profile":

            return interaction.update({
              embeds: [
                profileEmbed(interaction.user)
              ],
              components: mainButtons()
            });

          case "levels":

            return interaction.update({
              embeds: [
                levelsEmbed()
              ],
              components: mainButtons()
            });

          case "leaderboard":

            return interaction.update({
              embeds: [
                leaderboardEmbed(interaction.guild)
              ],
              components: mainButtons()
            });

          case "rules":

            return interaction.update({
              embeds: [
                rulesEmbed()
              ],
              components: [
                ...mainButtons(),
                ...rulesButtons()
              ]
            });

          case "rewards":

            return interaction.update({
              embeds: [
                rewardsEmbed()
              ],
              components: mainButtons()
            });

          case "shop":

            return interaction.update({
              embeds: [
                shopEmbed()
              ],
              components: mainButtons()
            });

          case "history":

            return interaction.reply({
              embeds: [
                historyEmbed(interaction.user)
              ],
              ephemeral: true
            });

          case "stats":

            return interaction.update({
              embeds: [
                statsEmbed()
              ],
              components: mainButtons()
            });

          /* لوحة التفعيل */

          case "setup_profile":

            getUser(interaction.user.id);

            return interaction.reply({
              embeds: [
                profileEmbed(interaction.user)
              ],
              ephemeral: true
            });

          case "setup_rules":

            return interaction.reply({
              embeds: [
                rulesEmbed()
              ],
              components: rulesButtons(),
              ephemeral: true
            });

          case "setup_levels":

            return interaction.reply({
              embeds: [
                levelsEmbed()
              ],
              ephemeral: true
            });

          /* A B C */

          case "rules_a":

            return interaction.reply({
              embeds: [
                rulesAEmbed()
              ],
              ephemeral: true
            });

          case "rules_b":

            return interaction.reply({
              embeds: [
                rulesBEmbed()
              ],
              ephemeral: true
            });

          case "rules_c":

            return interaction.reply({
              embeds: [
                rulesCEmbed()
              ],
              ephemeral: true
            });

          /* التكتات */

          case "ticket_support":

            return interaction.reply({
              content:
                "🎫 سيتم فتح تكت الدعم الفني هنا. اربط إنشاء القنوات بنظام التكتات الخاص بسيرفرك.",
              ephemeral: true
            });

          case "ticket_level":

            return interaction.reply({
              content:
                "📈 سيتم فتح تكت خاص بالترقية والاستفسار عن المستوى.",
              ephemeral: true
            });

          case "ticket_reward":

            return interaction.reply({
              content:
                "🎁 سيتم فتح تكت خاص بالمكافآت.",
              ephemeral: true
            });

        }
      }

    } catch (error) {

      console.error(
        "حدث خطأ أثناء تنفيذ التفاعل:",
        error
      );

      const response = {
        content:
          "❌ حدث خطأ أثناء تنفيذ الطلب.",
        ephemeral: true
      };

      if (
        interaction.replied ||
        interaction.deferred
      ) {

        await interaction
          .followUp(response)
          .catch(() => {});

      } else {

        await interaction
          .reply(response)
          .catch(() => {});

      }
    }
  }
);

/* =====================================================
   Web Server
===================================================== */

const server = http.createServer(
  (req, res) => {

    res.writeHead(
      200,
      {
        "Content-Type":
          "text/plain; charset=utf-8"
      }
    );

    res.end(
      "RIFT TOWN Bot is online."
    );
  }
);

server.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      `Render server يعمل على المنفذ ${PORT}`
    );

  }
);

/* =====================================================
   تشغيل البوت
===================================================== */

client
  .login(TOKEN)

  .then(() => {

    console.log(
      "تم تسجيل دخول البوت إلى Discord."
    );

  })

  .catch(error => {

    console.error(
      "فشل تسجيل دخول البوت:",
      error
    );

    process.exit(1);

  });