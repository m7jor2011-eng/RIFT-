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
  ChannelType,
  Events
} = require("discord.js");

const fs = require("fs");
const path = require("path");
const http = require("http");

/* =========================================================
   الإعدادات
========================================================= */

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const PORT = Number(process.env.PORT || 3000);

if (!TOKEN) {
  console.error("❌ لم يتم العثور على DISCORD_TOKEN في Environment Variables.");
  process.exit(1);
}

if (!CLIENT_ID) {
  console.error("❌ لم يتم العثور على CLIENT_ID في Environment Variables.");
  process.exit(1);
}

if (!GUILD_ID) {
  console.error("❌ لم يتم العثور على GUILD_ID في Environment Variables.");
  process.exit(1);
}

/* =========================================================
   قاعدة البيانات
========================================================= */

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
    database = JSON.parse(
      fs.readFileSync(DATA_FILE, "utf8")
    );
  } catch (error) {
    console.error("⚠️ تعذر قراءة قاعدة البيانات، سيتم إنشاء قاعدة جديدة.");
    database = {
      users: {},
      tickets: {}
    };
  }
}

if (!database.users) {
  database.users = {};
}

if (!database.tickets) {
  database.tickets = {};
}

function saveDatabase() {
  try {
    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify(database, null, 2),
      "utf8"
    );
  } catch (error) {
    console.error("❌ خطأ أثناء حفظ قاعدة البيانات:", error);
  }
}

/* =========================================================
   بيانات اللاعب
========================================================= */

function getUser(id) {
  if (!database.users[id]) {
    database.users[id] = {
      points: 0,
      hours: 0,
      evidence: 0,
      achievements: 0,
      history: []
    };

    saveDatabase();
  }

  return database.users[id];
}

/* =========================================================
   المستويات
   1 - 5 متوسط إلى صعب
   6 - 10 أصعب
========================================================= */

const LEVELS = [
  {
    level: 1,
    name: "عضو",
    points: 0,
    reward: "لا توجد مكافأة"
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
  return (
    LEVELS.find(level => level.points > points) ||
    null
  );
}

/* =========================================================
   تنسيق الساعات
========================================================= */

function formatHours(hours) {
  const totalMinutes = Math.round(
    Number(hours || 0) * 60
  );

  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;

  if (h === 0) {
    return `${m} دقيقة`;
  }

  if (m === 0) {
    return `${h} ساعة`;
  }

  return `${h} ساعة و${m} دقيقة`;
}

/* =========================================================
   السجل
========================================================= */

function addHistory(userId, data) {
  const user = getUser(userId);

  user.history.unshift({
    ...data,
    date: new Date().toISOString()
  });

  user.history = user.history.slice(0, 100);

  saveDatabase();
}

/* =========================================================
   التحقق من الدليل
========================================================= */

function validEvidence(attachment) {
  if (!attachment) {
    return false;
  }

  const contentType =
    attachment.contentType || "";

  return (
    contentType.startsWith("image/") ||
    contentType.startsWith("video/")
  );
}

/* =========================================================
   إضافة الدليل
========================================================= */

function submitProof(
  userId,
  type,
  hours,
  evidenceUrl,
  description
) {
  const user = getUser(userId);

  const oldLevel = getLevel(user.points);

  let points = 1;

  if (type === "hours") {
    points = Math.max(
      1,
      Math.floor(Number(hours))
    );

    user.hours += Number(hours);
  }

  if (type === "help") {
    points = 1;
  }

  if (type === "game") {
    points = 1;
  }

  if (type === "achievement") {
    points = 1;
    user.achievements += 1;
  }

  user.points += points;
  user.evidence += 1;

  addHistory(userId, {
    action: "رفع دليل",
    type,
    points,
    hours: Number(hours || 0),
    evidence: evidenceUrl,
    description
  });

  saveDatabase();

  return {
    oldLevel,
    newLevel: getLevel(user.points),
    points
  };
}

/* =========================================================
   ملف اللاعب
========================================================= */

function profileEmbed(user) {
  const data = getUser(user.id);

  const level = getLevel(data.points);
  const next = getNextLevel(data.points);

  return new EmbedBuilder()
    .setColor(0x111111)
    .setTitle("⚡ RIFT TOWN")
    .setDescription(
      `مرحباً بك في نظام المستويات والمكافآت.\n\n` +
      `👤 اللاعب: ${user}\n` +
      `🏆 الرتبة: **${level.name}**`
    )
    .addFields(
      {
        name: "المستوى",
        value: `${level.level}`,
        inline: true
      },
      {
        name: "النقاط",
        value: `${data.points}`,
        inline: true
      },
      {
        name: "الساعات",
        value: formatHours(data.hours),
        inline: true
      },
      {
        name: "الأدلة",
        value: `${data.evidence}`,
        inline: true
      },
      {
        name: "الإنجازات",
        value: `${data.achievements}`,
        inline: true
      },
      {
        name: "المستوى التالي",
        value: next
          ? `المستوى ${next.level} — ${next.points} نقطة`
          : "🏆 وصلت إلى أعلى مستوى",
        inline: true
      }
    )
    .setFooter({
      text: "RIFT TOWN • نظام السمعة"
    })
    .setTimestamp();
}

/* =========================================================
   المستويات
========================================================= */

function levelsEmbed() {
  return new EmbedBuilder()
    .setColor(0x111111)
    .setTitle("📊 المستويات")
    .setDescription(
      LEVELS.map(level =>
        `**المستوى ${level.level} — ${level.name}**\n` +
        `النقاط المطلوبة: **${level.points}**\n` +
        `المكافأة: ${level.reward}`
      ).join("\n\n")
    )
    .setFooter({
      text: "المستويات من 6 إلى 10 أصعب"
    });
}

/* =========================================================
   القوانين
========================================================= */

function rulesEmbed() {
  return new EmbedBuilder()
    .setColor(0x111111)
    .setTitle("📜 القوانين")
    .setDescription(
      "1️⃣ يجب أن يكون الدليل صورة أو فيديو واضحًا.\n\n" +

      "2️⃣ يجب أن يثبت الدليل التواجد أو مساعدة لاعب أو إنجازًا.\n\n" +

      "3️⃣ يمنع رفع الدليل أكثر من مرة لنفس النشاط.\n\n" +

      "4️⃣ يمنع استخدام دليل مزور أو معدل للحصول على نقاط.\n\n" +

      "5️⃣ كل لاعب مسؤول عن صحة الأدلة التي يرفعها.\n\n" +

      "6️⃣ المكافآت المالية يتم صرفها يوم **الجمعة**.\n\n" +

      "7️⃣ زيادة المستوى تكون تدريجية وليست سهلة جدًا.\n\n" +

      "8️⃣ من المستوى 6 إلى 10 تكون متطلبات الترقية أصعب.\n\n" +

      "9️⃣ المستوى 8 يفتح لوحة مركبة من اختيار اللاعب.\n\n" +

      "🔟 المستوى 9 يفتح مركبة من اختيار اللاعب.\n\n" +

      "1️⃣1️⃣ المستوى 10 يفتح رتبة شيخ ومميزاتها.\n\n" +

      "1️⃣2️⃣ يمنع استغلال النظام أو إرسال أدلة وهمية للحصول على مكافآت."
    );
}

/* =========================================================
   المكافآت
========================================================= */

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
      "\n\n💰 **صرف المكافآت المالية يكون يوم الجمعة.**"
    );
}

/* =========================================================
   المتجر
========================================================= */

function shopEmbed() {
  return new EmbedBuilder()
    .setColor(0x111111)
    .setTitle("🛒 المتجر")
    .setDescription(
      "العناصر التجميلية والمميزات:\n\n" +

      "✨ المستوى 8: لوحة مركبة من اختيار اللاعب.\n\n" +

      "🚗 المستوى 9: مركبة من اختيار اللاعب.\n\n" +

      "👑 المستوى 10: رتبة شيخ ومميزاتها.\n\n" +

      "يمكن للإدارة إضافة عناصر تجميلية جديدة مستقبلاً."
    );
}

/* =========================================================
   السجل
========================================================= */

function historyEmbed(user) {
  const data = getUser(user.id);

  if (!data.history.length) {
    return new EmbedBuilder()
      .setColor(0x111111)
      .setTitle("📋 السجل")
      .setDescription(
        "لا يوجد لديك سجل حتى الآن."
      );
  }

  return new EmbedBuilder()
    .setColor(0x111111)
    .setTitle("📋 السجل")
    .setDescription(
      data.history
        .slice(0, 10)
        .map((item, index) => {
          return (
            `**${index + 1}. ${item.action}**\n` +
            `النقاط: ${item.points || 0}\n` +
            `الوصف: ${item.description || "بدون وصف"}`
          );
        })
        .join("\n\n")
    );
}

/* =========================================================
   المتصدرون
========================================================= */

function leaderboardEmbed(guild) {
  const players = Object.entries(
    database.users
  )
    .sort(
      (a, b) =>
        (b[1].points || 0) -
        (a[1].points || 0)
    )
    .slice(0, 10);

  if (!players.length) {
    return new EmbedBuilder()
      .setColor(0x111111)
      .setTitle("🏆 المتصدرون")
      .setDescription(
        "لا توجد بيانات حتى الآن."
      );
  }

  return new EmbedBuilder()
    .setColor(0x111111)
    .setTitle("🏆 المتصدرون")
    .setDescription(
      players
        .map(([id, data], index) => {
          const member =
            guild.members.cache.get(id);

          const name = member
            ? member.displayName
            : `<@${id}>`;

          const level =
            getLevel(data.points || 0);

          return (
            `**${index + 1}. ${name}**\n` +
            `المستوى ${level.level} — ${data.points} نقطة`
          );
        })
        .join("\n\n")
    );
}

/* =========================================================
   الإحصائيات
========================================================= */

function statsEmbed() {
  const users =
    Object.values(database.users);

  const totalHours =
    users.reduce(
      (sum, user) =>
        sum + Number(user.hours || 0),
      0
    );

  const totalEvidence =
    users.reduce(
      (sum, user) =>
        sum + Number(user.evidence || 0),
      0
    );

  const totalAchievements =
    users.reduce(
      (sum, user) =>
        sum + Number(user.achievements || 0),
      0
    );

  const totalPoints =
    users.reduce(
      (sum, user) =>
        sum + Number(user.points || 0),
      0
    );

  return new EmbedBuilder()
    .setColor(0x111111)
    .setTitle("📈 إحصائيات النظام")
    .addFields(
      {
        name: "عدد اللاعبين",
        value: `${users.length}`,
        inline: true
      },
      {
        name: "إجمالي النقاط",
        value: `${totalPoints}`,
        inline: true
      },
      {
        name: "إجمالي الساعات",
        value: formatHours(totalHours),
        inline: true
      },
      {
        name: "إجمالي الأدلة",
        value: `${totalEvidence}`,
        inline: true
      },
      {
        name: "إجمالي الإنجازات",
        value: `${totalAchievements}`,
        inline: true
      }
    );
}

/* =========================================================
   أزرار نظام السمعة
========================================================= */

function reputationButtons() {
  return [
    new ActionRowBuilder()
      .addComponents(
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

    new ActionRowBuilder()
      .addComponents(
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

/* =========================================================
   لوحة تفعيل الحساب
========================================================= */

function accountPanel() {
  return {
    embeds: [
      new EmbedBuilder()
        .setColor(0x111111)
        .setTitle("⚡ RIFT TOWN")
        .setDescription(
          "مرحباً بك في نظام المستويات والمكافآت.\n\n" +

          "استخدم الأزرار بالأسفل لمعرفة مستواك ومكافآتك وقوانين النظام."
        )
    ],

    components: [
      new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId("activate_account")
            .setLabel("تفعيل حسابي")
            .setStyle(ButtonStyle.Success),

          new ButtonBuilder()
            .setCustomId("account_rules")
            .setLabel("القوانين")
            .setStyle(ButtonStyle.Secondary),

          new ButtonBuilder()
            .setCustomId("account_levels")
            .setLabel("المستويات")
            .setStyle(ButtonStyle.Secondary)
        )
    ]
  };
}

/* =========================================================
   لوحة التذاكر
========================================================= */

function ticketPanel() {
  return {
    embeds: [
      new EmbedBuilder()
        .setColor(0x111111)
        .setTitle("🎫 التذاكر")
        .setDescription(
          "اضغط على الزر المناسب لفتح تذكرة.\n\n" +

          "🆘 **الدعم الفني**\n" +
          "للمشاكل والاستفسارات التقنية.\n\n" +

          "📈 **الترقية**\n" +
          "للاستفسار عن المستوى والترقية.\n\n" +

          "🎁 **المكافآت**\n" +
          "للاستفسار عن المكافآت."
        )
    ],

    components: [
      new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId("ticket_support")
            .setLabel("الدعم الفني")
            .setStyle(ButtonStyle.Primary),

          new ButtonBuilder()
            .setCustomId("ticket_upgrade")
            .setLabel("الترقية")
            .setStyle(ButtonStyle.Secondary),

          new ButtonBuilder()
            .setCustomId("ticket_rewards")
            .setLabel("المكافآت")
            .setStyle(ButtonStyle.Success)
        )
    ]
  };
}

/* =========================================================
   أوامر Slash
========================================================= */

const commands = [
  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("فحص حالة البوت"),

  new SlashCommandBuilder()
    .setName("reputation")
    .setDescription("فتح نظام السمعة"),

  new SlashCommandBuilder()
    .setName("profile")
    .setDescription("عرض ملف اللاعب"),

  new SlashCommandBuilder()
    .setName("levels")
    .setDescription("عرض المستويات"),

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
    .setName("setup")
    .setDescription("إرسال لوحة تفعيل الحساب")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild.toString()
    ),

  new SlashCommandBuilder()
    .setName("tickets")
    .setDescription("إرسال لوحة التذاكر")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild.toString()
    ),

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

/* =========================================================
   Discord Client
========================================================= */

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds
  ]
});

/* =========================================================
   تسجيل Slash Commands
   مهم جدًا:
   يتم التسجيل مباشرة في السيرفر المحدد بـ GUILD_ID
========================================================= */

client.once(
  Events.ClientReady,
  async readyClient => {

    console.log(
      `✅ تم تشغيل البوت: ${readyClient.user.tag}`
    );

    console.log(
      `🆔 CLIENT_ID: ${CLIENT_ID}`
    );

    console.log(
      `🏠 GUILD_ID: ${GUILD_ID}`
    );

    const rest = new REST({
      version: "10"
    }).setToken(TOKEN);

    try {

      console.log(
        "⏳ جاري تسجيل أوامر Slash..."
      );

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
        `✅ تم تسجيل ${commands.length} أمر Slash في السيرفر بنجاح.`
      );

    } catch (error) {

      console.error(
        "❌ فشل تسجيل أوامر Slash:"
      );

      console.error(error);
    }
  }
);

/* =========================================================
   التفاعلات
========================================================= */

client.on(
  Events.InteractionCreate,
  async interaction => {

    try {

      /* =====================================================
         Slash Commands
      ===================================================== */

      if (interaction.isChatInputCommand()) {

        /* ---------------------------------------------------
           PING
        --------------------------------------------------- */

        if (
          interaction.commandName === "ping"
        ) {

          return interaction.reply({
            content:
              `🏓 البوت يعمل.\nزمن الاستجابة: ${client.ws.ping}ms`
          });
        }

        /* ---------------------------------------------------
           REPUTATION
        --------------------------------------------------- */

        if (
          interaction.commandName === "reputation"
        ) {

          return interaction.reply({
            embeds: [
              new EmbedBuilder()
                .setColor(0x111111)
                .setTitle("⚡ RIFT TOWN")
                .setDescription(
                  "مرحباً بك في نظام المستويات والمكافآت.\n\n" +
                  "استخدم الأزرار الموجودة أسفل الرسالة لمعرفة معلومات النظام."
                )
            ],
            components: reputationButtons()
          });
        }

        /* ---------------------------------------------------
           PROFILE
        --------------------------------------------------- */

        if (
          interaction.commandName === "profile"
        ) {

          return interaction.reply({
            embeds: [
              profileEmbed(
                interaction.user
              )
            ]
          });
        }

        /* ---------------------------------------------------
           LEVELS
        --------------------------------------------------- */

        if (
          interaction.commandName === "levels"
        ) {

          return interaction.reply({
            embeds: [
              levelsEmbed()
            ]
          });
        }

        /* ---------------------------------------------------
           LEADERBOARD
        --------------------------------------------------- */

        if (
          interaction.commandName === "leaderboard"
        ) {

          return interaction.reply({
            embeds: [
              leaderboardEmbed(
                interaction.guild
              )
            ]
          });
        }

        /* ---------------------------------------------------
           HISTORY
        --------------------------------------------------- */

        if (
          interaction.commandName === "history"
        ) {

          return interaction.reply({
            embeds: [
              historyEmbed(
                interaction.user
              )
            ],
            ephemeral: true
          });
        }

        /* ---------------------------------------------------
           REWARDS
        --------------------------------------------------- */

        if (
          interaction.commandName === "rewards"
        ) {

          return interaction.reply({
            embeds: [
              rewardsEmbed()
            ]
          });
        }

        /* ---------------------------------------------------
           SHOP
        --------------------------------------------------- */

        if (
          interaction.commandName === "shop"
        ) {

          return interaction.reply({
            embeds: [
              shopEmbed()
            ]
          });
        }

        /* ---------------------------------------------------
           RULES
        --------------------------------------------------- */

        if (
          interaction.commandName === "rules"
        ) {

          return interaction.reply({
            embeds: [
              rulesEmbed()
            ]
          });
        }

        /* ---------------------------------------------------
           STATS
        --------------------------------------------------- */

        if (
          interaction.commandName === "stats"
        ) {

          return interaction.reply({
            embeds: [
              statsEmbed()
            ]
          });
        }

        /* ---------------------------------------------------
           SETUP
        --------------------------------------------------- */

        if (
          interaction.commandName === "setup"
        ) {

          return interaction.reply({
            ...accountPanel()
          });
        }

        /* ---------------------------------------------------
           TICKETS
        --------------------------------------------------- */

        if (
          interaction.commandName === "tickets"
        ) {

          return interaction.reply({
            ...ticketPanel()
          });
        }

        /* ---------------------------------------------------
           PROOF
        --------------------------------------------------- */

        if (
          interaction.commandName === "proof"
        ) {

          const type =
            interaction.options.getString(
              "type"
            );

          const hours =
            interaction.options.getNumber(
              "hours"
            );

          const evidence =
            interaction.options.getAttachment(
              "evidence"
            );

          const description =
            interaction.options.getString(
              "description"
            );

          if (!validEvidence(evidence)) {

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

          const result =
            submitProof(
              interaction.user.id,
              type,
              hours,
              evidence.url,
              description
            );

          const levelUp =
            result.newLevel.level >
            result.oldLevel.level;

          let message =
            `تم تسجيل الدليل مباشرة.\n\n` +
            `النقاط المضافة: **${result.points}**\n` +
            `المستوى الحالي: **${result.newLevel.level}**`;

          if (levelUp) {

            message +=
              `\n\n🎉 تمت الترقية من المستوى **${result.oldLevel.level}** إلى المستوى **${result.newLevel.level}**.`;
          }

          return interaction.reply({

            embeds: [
              new EmbedBuilder()
                .setColor(0x111111)
                .setTitle("✅ تم تسجيل الدليل")
                .setDescription(message)
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
      }

      /* =====================================================
         الأزرار
      ===================================================== */

      if (interaction.isButton()) {

        /* ---------------------------------------------------
           أزرار نظام السمعة
        --------------------------------------------------- */

        if (
          interaction.customId === "profile"
        ) {

          return interaction.update({
            embeds: [
              profileEmbed(
                interaction.user
              )
            ],
            components: reputationButtons()
          });
        }

        if (
          interaction.customId === "levels"
        ) {

          return interaction.update({
            embeds: [
              levelsEmbed()
            ],
            components: reputationButtons()
          });
        }

        if (
          interaction.customId === "leaderboard"
        ) {

          return interaction.update({
            embeds: [
              leaderboardEmbed(
                interaction.guild
              )
            ],
            components: reputationButtons()
          });
        }

        if (
          interaction.customId === "rules"
        ) {

          return interaction.update({
            embeds: [
              rulesEmbed()
            ],
            components: reputationButtons()
          });
        }

        if (
          interaction.customId === "rewards"
        ) {

          return interaction.update({
            embeds: [
              rewardsEmbed()
            ],
            components: reputationButtons()
          });
        }

        if (
          interaction.customId === "shop"
        ) {

          return interaction.update({
            embeds: [
              shopEmbed()
            ],
            components: reputationButtons()
          });
        }

        if (
          interaction.customId === "history"
        ) {

          return interaction.reply({
            embeds: [
              historyEmbed(
                interaction.user
              )
            ],
            ephemeral: true
          });
        }

        if (
          interaction.customId === "stats"
        ) {

          return interaction.update({
            embeds: [
              statsEmbed()
            ],
            components: reputationButtons()
          });
        }

        /* ---------------------------------------------------
           لوحة الحساب
        --------------------------------------------------- */

        if (
          interaction.customId === "activate_account"
        ) {

          return interaction.reply({
            embeds: [
              profileEmbed(
                interaction.user
              )
            ],
            ephemeral: true
          });
        }

        if (
          interaction.customId === "account_rules"
        ) {

          return interaction.reply({
            embeds: [
              rulesEmbed()
            ],
            ephemeral: true
          });
        }

        if (
          interaction.customId === "account_levels"
        ) {

          return interaction.reply({
            embeds: [
              levelsEmbed()
            ],
            ephemeral: true
          });
        }

        /* ---------------------------------------------------
           التذاكر
        --------------------------------------------------- */

        if (
          interaction.customId.startsWith(
            "ticket_"
          )
        ) {

          const type =
            interaction.customId.replace(
              "ticket_",
              ""
            );

          const existingTicket =
            Object.values(
              database.tickets
            ).find(
              ticket =>
                ticket.userId ===
                  interaction.user.id &&
                ticket.open === true
            );

          if (existingTicket) {

            return interaction.reply({
              content:
                `❌ لديك تذكرة مفتوحة بالفعل: <#${existingTicket.channelId}>`,
              ephemeral: true
            });
          }

          let ticketName =
            "تذكرة";

          let ticketTitle =
            "🎫 تذكرة";

          if (type === "support") {
            ticketName =
              "دعم";
            ticketTitle =
              "🆘 الدعم الفني";
          }

          if (type === "upgrade") {
            ticketName =
              "ترقية";
            ticketTitle =
              "📈 طلب ترقية";
          }

          if (type === "rewards") {
            ticketName =
              "مكافآت";
            ticketTitle =
              "🎁 المكافآت";
          }

          const channel =
            await interaction.guild.channels.create({
              name:
                `${ticketName}-${interaction.user.username}`
                  .toLowerCase()
                  .replace(
                    /[^a-z0-9\u0600-\u06ff-]/g,
                    "-"
                  )
                  .slice(0, 90),

              type:
                ChannelType.GuildText,

              permissionOverwrites: [
                {
                  id:
                    interaction.guild.roles.everyone.id,

                  deny: [
                    PermissionFlagsBits.ViewChannel
                  ]
                },

                {
                  id:
                    interaction.user.id,

                  allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.ReadMessageHistory
                  ]
                }
              ]
            });

          database.tickets[channel.id] = {
            userId:
              interaction.user.id,

            channelId:
              channel.id,

            type,

            open: true,

            createdAt:
              new Date().toISOString()
          };

          saveDatabase();

          const closeRow =
            new ActionRowBuilder()
              .addComponents(
                new ButtonBuilder()
                  .setCustomId(
                    "close_ticket"
                  )
                  .setLabel(
                    "إغلاق التذكرة"
                  )
                  .setStyle(
                    ButtonStyle.Danger
                  )
              );

          await channel.send({

            content:
              `<@${interaction.user.id}>`,

            embeds: [
              new EmbedBuilder()
                .setColor(0x111111)
                .setTitle(ticketTitle)
                .setDescription(
                  "تم فتح التذكرة بنجاح.\n\n" +
                  "اكتب مشكلتك أو استفسارك هنا، وسيتم التعامل معها من الإدارة."
                )
                .setFooter({
                  text:
                    "RIFT TOWN • نظام التذاكر"
                })
                .setTimestamp()
            ],

            components: [
              closeRow
            ]
          });

          return interaction.reply({
            content:
              `✅ تم فتح تذكرتك: <#${channel.id}>`,
            ephemeral: true
          });
        }

        /* ---------------------------------------------------
           إغلاق التذكرة
        --------------------------------------------------- */

        if (
          interaction.customId === "close_ticket"
        ) {

          const ticket =
            database.tickets[
              interaction.channel.id
            ];

          if (!ticket) {

            return interaction.reply({
              content:
                "❌ هذه القناة ليست تذكرة مسجلة.",
              ephemeral: true
            });
          }

          ticket.open = false;
          ticket.closedAt =
            new Date().toISOString();

          saveDatabase();

          await interaction.reply({
            content:
              "🔒 سيتم إغلاق التذكرة خلال 5 ثوانٍ."
          });

          setTimeout(
            async () => {
              try {
                await interaction.channel.delete();
              } catch (error) {
                console.error(
                  "تعذر حذف التذكرة:",
                  error
                );
              }
            },
            5000
          );

          return;
        }
      }

    } catch (error) {

      console.error(
        "❌ حدث خطأ أثناء تنفيذ التفاعل:"
      );

      console.error(error);

      const response = {
        content:
          "❌ حدث خطأ أثناء تنفيذ الطلب.",
        ephemeral: true
      };

      try {

        if (
          interaction.replied ||
          interaction.deferred
        ) {

          await interaction.followUp(
            response
          );

        } else {

          await interaction.reply(
            response
          );
        }

      } catch (replyError) {

        console.error(
          "تعذر إرسال رسالة الخطأ:",
          replyError
        );
      }
    }
  }
);

/* =========================================================
   سيرفر Render
========================================================= */

const server =
  http.createServer(
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
      `🌐 Web server يعمل على المنفذ ${PORT}`
    );
  }
);

/* =========================================================
   تشغيل البوت
========================================================= */

client
  .login(TOKEN)

  .then(() => {

    console.log(
      "✅ تم تسجيل دخول البوت بنجاح."
    );

  })

  .catch(error => {

    console.error(
      "❌ فشل تسجيل دخول البوت:"
    );

    console.error(error);

    process.exit(1);
  });