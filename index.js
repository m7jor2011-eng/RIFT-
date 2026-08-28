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
  Events
} = require("discord.js");

const fs = require("fs");
const path = require("path");
const http = require("http");

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const PORT = Number(process.env.PORT || 3000);

if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
  throw new Error(
    "يجب إضافة DISCORD_TOKEN و CLIENT_ID و GUILD_ID في Environment Variables."
  );
}

/* =========================
   قاعدة البيانات
========================= */

const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "database.json");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

let database = {
  users: {}
};

if (fs.existsSync(DATA_FILE)) {
  try {
    database = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch {
    database = { users: {} };
  }
}

if (!database.users) {
  database.users = {};
}

function saveDatabase() {
  fs.writeFileSync(
    DATA_FILE,
    JSON.stringify(database, null, 2),
    "utf8"
  );
}

function getUser(userId) {
  if (!database.users[userId]) {
    database.users[userId] = {
      points: 0,
      hours: 0,
      achievements: 0,
      evidence: 0,
      coins: 0,
      history: []
    };

    saveDatabase();
  }

  return database.users[userId];
}

/* =========================
   المستويات
========================= */

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
  return LEVELS.find(level => level.points > points) || null;
}

function formatHours(hours) {
  const minutes = Math.round(hours * 60);

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

/* =========================
   السجل
========================= */

function addHistory(userId, action) {
  const user = getUser(userId);

  user.history.unshift({
    ...action,
    date: new Date().toISOString()
  });

  user.history = user.history.slice(0, 100);
}

/* =========================
   إضافة دليل
========================= */

function isValidEvidence(attachment) {
  if (!attachment) return false;

  const type = attachment.contentType || "";

  return (
    type.startsWith("image/") ||
    type.startsWith("video/")
  );
}

function addProof(userId, type, hours, evidenceUrl, description) {
  const user = getUser(userId);

  const oldLevel = getLevel(user.points);

  let pointsAdded = 1;

  if (type === "hours") {
    pointsAdded = Math.max(
      1,
      Math.floor(Number(hours))
    );

    user.hours += Number(hours);
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

  saveDatabase();

  return {
    oldLevel,
    newLevel: getLevel(user.points),
    pointsAdded
  };
}

/* =========================
   الواجهات
========================= */

function profileEmbed(user) {
  const data = getUser(user.id);

  const level = getLevel(data.points);
  const next = getNextLevel(data.points);

  return new EmbedBuilder()
    .setColor(0x111111)
    .setTitle("ملف اللاعب")
    .setDescription(
      `اللاعب: ${user}\n\n` +
      `الرتبة الحالية: ${level.name}`
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
          : "وصلت إلى أعلى مستوى",
        inline: true
      }
    )
    .setFooter({
      text: "نظام السمعة والمستويات"
    })
    .setTimestamp();
}

function levelsEmbed() {
  return new EmbedBuilder()
    .setColor(0x111111)
    .setTitle("المستويات والمكافآت")
    .setDescription(
      LEVELS.map(level =>
        `المستوى ${level.level} — ${level.name}\n` +
        `النقاط المطلوبة: ${level.points}\n` +
        `المكافأة: ${level.reward}`
      ).join("\n\n")
    );
}

function rulesEmbed() {
  return new EmbedBuilder()
    .setColor(0x111111)
    .setTitle("القوانين")
    .setDescription(
      "القانون الأول: يجب أن يكون الدليل صورة أو فيديو واضحًا.\n\n" +

      "القانون الثاني: يجب أن يثبت الدليل التواجد أو مساعدة لاعب أو إنجازًا.\n\n" +

      "القانون الثالث: يمنع رفع دليل مكرر لنفس النشاط.\n\n" +

      "القانون الرابع: يمنع استخدام الأدلة المزورة أو المعدلة بهدف الحصول على نقاط.\n\n" +

      "القانون الخامس: يتم احتساب النقاط مباشرة عند قبول الدليل من النظام، بدون موافقة إدارية.\n\n" +

      "القانون السادس: المكافآت المالية الخاصة بالترقيات يتم صرفها يوم الجمعة.\n\n" +

      "القانون السابع: مستوى 8 يفتح لوحة مركبة من اختيار اللاعب.\n\n" +

      "القانون الثامن: مستوى 9 يفتح مركبة من اختيار اللاعب.\n\n" +

      "القانون التاسع: مستوى 10 يفتح رتبة شيخ ومميزاتها حسب نظام السيرفر.\n\n" +

      "القانون العاشر: إساءة استخدام نظام الأدلة قد تؤدي إلى إلغاء الاستفادة من النظام."
    );
}

function rewardsEmbed() {
  return new EmbedBuilder()
    .setColor(0x111111)
    .setTitle("المكافآت")
    .setDescription(
      LEVELS
        .filter(level => level.level > 1)
        .map(level =>
          `المستوى ${level.level}: ${level.reward}`
        )
        .join("\n\n") +

      "\n\nالمكافآت المالية يتم صرفها يوم الجمعة، ولا يقوم البوت بتحويل الأموال تلقائيًا."
    );
}

function shopEmbed() {
  return new EmbedBuilder()
    .setColor(0x111111)
    .setTitle("المتجر")
    .setDescription(
      "متجر المكافآت.\n\n" +
      "مكافآت المستوى 8 والمستوى 9 والمستوى 10 يتم فتحها عن طريق المستوى ولا يتم شراؤها من المتجر.\n\n" +
      "يمكن إضافة عناصر تجميلية للمتجر لاحقًا."
    );
}

function historyEmbed(user) {
  const data = getUser(user.id);

  if (!data.history.length) {
    return new EmbedBuilder()
      .setColor(0x111111)
      .setTitle("السجل")
      .setDescription("لا يوجد لديك نشاط مسجل حتى الآن.");
  }

  return new EmbedBuilder()
    .setColor(0x111111)
    .setTitle("سجل اللاعب")
    .setDescription(
      data.history
        .slice(0, 10)
        .map((item, index) =>
          `${index + 1}. ${item.action}\n` +
          `النقاط: ${item.pointsAdded || 0}\n` +
          `الوصف: ${item.description || "بدون وصف"}`
        )
        .join("\n\n")
    );
}

function leaderboardEmbed(guild) {
  const players = Object.entries(database.users)
    .sort((a, b) => b[1].points - a[1].points)
    .slice(0, 10);

  if (!players.length) {
    return new EmbedBuilder()
      .setColor(0x111111)
      .setTitle("المتصدرون")
      .setDescription("لا توجد بيانات حتى الآن.");
  }

  const text = players.map(([id, data], index) => {
    const member = guild.members.cache.get(id);

    const name = member
      ? member.displayName
      : `<@${id}>`;

    const level = getLevel(data.points);

    return (
      `${index + 1}. ${name} — ` +
      `المستوى ${level.level} — ` +
      `${data.points} نقطة`
    );
  }).join("\n");

  return new EmbedBuilder()
    .setColor(0x111111)
    .setTitle("المتصدرون")
    .setDescription(text);
}

function statsEmbed() {
  const users = Object.values(database.users);

  const totalHours = users.reduce(
    (sum, user) => sum + (user.hours || 0),
    0
  );

  const totalProofs = users.reduce(
    (sum, user) => sum + (user.evidence || 0),
    0
  );

  const totalAchievements = users.reduce(
    (sum, user) => sum + (user.achievements || 0),
    0
  );

  return new EmbedBuilder()
    .setColor(0x111111)
    .setTitle("إحصائيات النظام")
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

/* =========================
   الأزرار
========================= */

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

/* =========================
   أوامر Slash
========================= */

const commands = [

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

/* =========================
   Discord Client
========================= */

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds
  ]
});

/* =========================
   تسجيل الأوامر
========================= */

client.once(Events.ClientReady, async readyClient => {

  console.log(
    `تم تشغيل البوت: ${readyClient.user.tag}`
  );

  const rest = new REST({
    version: "10"
  }).setToken(TOKEN);

  try {

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

  } catch (error) {

    console.error(
      "فشل تسجيل أوامر Slash:",
      error
    );

  }

});

/* =========================
   التعامل مع الأوامر
========================= */

client.on(
  Events.InteractionCreate,
  async interaction => {

    try {

      if (interaction.isChatInputCommand()) {

        switch (interaction.commandName) {

          case "reputation":

            return interaction.reply({
              embeds: [
                new EmbedBuilder()
                  .setColor(0x111111)
                  .setTitle("نظام السمعة")
                  .setDescription(
                    "استخدم الأزرار الموجودة أسفل الرسالة للوصول إلى ملفك والمستويات والقوانين والمكافآت والمتجر والسجل."
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
              ]
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
                  "يجب رفع صورة أو فيديو فقط.",
                ephemeral: true
              });

            }

            if (
              type === "hours" &&
              (!hours || hours <= 0)
            ) {

              return interaction.reply({
                content:
                  "يجب كتابة عدد الساعات.",
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
                  .setTitle("تم تسجيل الدليل")
                  .setDescription(
                    `تم تسجيل الدليل مباشرة بدون موافقة.\n\n` +
                    `النقاط المضافة: ${result.pointsAdded}\n` +
                    `المستوى الحالي: ${result.newLevel.level}` +
                    (
                      levelUp
                        ? `\nتمت الترقية من المستوى ${result.oldLevel.level} إلى المستوى ${result.newLevel.level}.`
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
                "الأمر غير معروف.",
              ephemeral: true
            });

        }

      }

      /* =========================
         الأزرار
      ========================= */

      if (interaction.isButton()) {

        switch (interaction.customId) {

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
              components: mainButtons()
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

        }

      }

    } catch (error) {

      console.error(
        "حدث خطأ أثناء تنفيذ التفاعل:",
        error
      );

      const response = {
        content:
          "حدث خطأ أثناء تنفيذ الطلب.",
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

/* =========================
   Render Web Server
========================= */

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
      "Reputation Level Bot is online."
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

/* =========================
   تشغيل البوت
========================= */

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