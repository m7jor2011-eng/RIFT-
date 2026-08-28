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
const PORT = Number(process.env.PORT || 3000);

if (!TOKEN) {
  console.error("لم يتم العثور على DISCORD_TOKEN");
  process.exit(1);
}

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
    database = JSON.parse(
      fs.readFileSync(DATA_FILE, "utf8")
    );
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
    reward: "2,000 ريال"
  },
  {
    level: 3,
    name: "عضو خبير",
    points: 25,
    reward: "5,000 ريال"
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
  return LEVELS.find(
    level => level.points > points
  );
}

function formatHours(hours) {
  const totalMinutes = Math.round(
    Number(hours) * 60
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

/* =========================
   السجل
========================= */

function addHistory(id, data) {
  const user = getUser(id);

  user.history.unshift({
    ...data,
    date: new Date().toISOString()
  });

  user.history =
    user.history.slice(0, 100);
}

/* =========================
   التحقق من الدليل
========================= */

function validEvidence(attachment) {
  if (!attachment) {
    return false;
  }

  const type =
    attachment.contentType || "";

  return (
    type.startsWith("image/") ||
    type.startsWith("video/")
  );
}

/* =========================
   إضافة الدليل
========================= */

function submitProof(
  id,
  type,
  hours,
  evidence,
  description
) {
  const user = getUser(id);

  const oldLevel =
    getLevel(user.points);

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
    user.achievements++;
  }

  user.points += points;
  user.evidence++;

  addHistory(id, {
    action: "رفع دليل",
    type,
    points,
    hours: Number(hours || 0),
    evidence,
    description
  });

  saveDatabase();

  return {
    oldLevel,
    newLevel: getLevel(user.points),
    points
  };
}

/* =========================
   ملف اللاعب
========================= */

function profileEmbed(user) {
  const data = getUser(user.id);

  const level =
    getLevel(data.points);

  const next =
    getNextLevel(data.points);

  return new EmbedBuilder()
    .setColor(0x111111)
    .setTitle("ملف اللاعب")
    .setDescription(
      `اللاعب: ${user}\n\n` +
      `الرتبة: ${level.name}`
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
        name: "الأدلة",
        value: String(data.evidence),
        inline: true
      },
      {
        name: "الإنجازات",
        value: String(data.achievements),
        inline: true
      },
      {
        name: "المستوى التالي",
        value: next
          ? `${next.level} — ${next.points} نقطة`
          : "أعلى مستوى",
        inline: true
      }
    )
    .setFooter({
      text: "نظام السمعة"
    })
    .setTimestamp();
}

/* =========================
   المستويات
========================= */

function levelsEmbed() {
  return new EmbedBuilder()
    .setColor(0x111111)
    .setTitle("المستويات")
    .setDescription(
      LEVELS.map(level =>
        `المستوى ${level.level} — ${level.name}\n` +
        `النقاط المطلوبة: ${level.points}\n` +
        `المكافأة: ${level.reward}`
      ).join("\n\n")
    );
}

/* =========================
   القوانين
========================= */

function rulesEmbed() {
  return new EmbedBuilder()
    .setColor(0x111111)
    .setTitle("القوانين")
    .setDescription(
      "القانون الأول: يجب أن يكون الدليل صورة أو فيديو واضحًا.\n\n" +

      "القانون الثاني: يجب أن يثبت الدليل التواجد أو مساعدة لاعب أو إنجازًا.\n\n" +

      "القانون الثالث: يمنع رفع الدليل أكثر من مرة لنفس النشاط.\n\n" +

      "القانون الرابع: يمنع استخدام دليل مزور أو معدل للحصول على نقاط.\n\n" +

      "القانون الخامس: رفع الدليل لا يحتاج إلى موافقة إدارية.\n\n" +

      "القانون السادس: المكافآت المالية يتم صرفها يوم الجمعة.\n\n" +

      "القانون السابع: زيادة المستوى تكون تدريجية وليست سهلة جدًا.\n\n" +

      "القانون الثامن: من المستوى 6 إلى 10 تكون متطلبات الترقية أصعب.\n\n" +

      "القانون التاسع: المستوى 8 يفتح لوحة مركبة من اختيار اللاعب.\n\n" +

      "القانون العاشر: المستوى 9 يفتح مركبة من اختيار اللاعب.\n\n" +

      "القانون الحادي عشر: المستوى 10 يفتح رتبة شيخ ومميزاتها.\n\n" +

      "القانون الثاني عشر: المكافآت المالية لا تتجاوز إجمالي النظام المحدد من الإدارة."
    );
}

/* =========================
   المكافآت
========================= */

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

      "\n\nصرف المكافآت المالية يكون يوم الجمعة."
    );
}

/* =========================
   المتجر
========================= */

function shopEmbed() {
  return new EmbedBuilder()
    .setColor(0x111111)
    .setTitle("المتجر")
    .setDescription(
      "المتجر\n\n" +

      "عناصر تجميلية قابلة للإضافة.\n\n" +

      "المستوى 8: لوحة مركبة من اختيار اللاعب.\n\n" +

      "المستوى 9: مركبة من اختيار اللاعب.\n\n" +

      "المستوى 10: رتبة شيخ ومميزاتها."
    );
}

/* =========================
   السجل
========================= */

function historyEmbed(user) {
  const data =
    getUser(user.id);

  if (!data.history.length) {
    return new EmbedBuilder()
      .setColor(0x111111)
      .setTitle("السجل")
      .setDescription(
        "لا يوجد لديك سجل حتى الآن."
      );
  }

  return new EmbedBuilder()
    .setColor(0x111111)
    .setTitle("السجل")
    .setDescription(
      data.history
        .slice(0, 10)
        .map(
          (item, index) =>
            `${index + 1}. ${item.action}\n` +
            `النقاط: ${item.points || 0}\n` +
            `الوصف: ${item.description || "بدون وصف"}`
        )
        .join("\n\n")
    );
}

/* =========================
   المتصدرون
========================= */

function leaderboardEmbed(guild) {
  const players =
    Object.entries(database.users)
      .sort(
        (a, b) =>
          b[1].points - a[1].points
      )
      .slice(0, 10);

  if (!players.length) {
    return new EmbedBuilder()
      .setColor(0x111111)
      .setTitle("المتصدرون")
      .setDescription(
        "لا توجد بيانات حتى الآن."
      );
  }

  return new EmbedBuilder()
    .setColor(0x111111)
    .setTitle("المتصدرون")
    .setDescription(
      players
        .map(([id, data], index) => {
          const member =
            guild.members.cache.get(id);

          const name =
            member
              ? member.displayName
              : `<@${id}>`;

          const level =
            getLevel(data.points);

          return (
            `${index + 1}. ${name}\n` +
            `المستوى ${level.level} — ${data.points} نقطة`
          );
        })
        .join("\n\n")
    );
}

/* =========================
   الإحصائيات
========================= */

function statsEmbed() {
  const users =
    Object.values(database.users);

  const totalHours =
    users.reduce(
      (sum, user) =>
        sum + (user.hours || 0),
      0
    );

  const totalEvidence =
    users.reduce(
      (sum, user) =>
        sum + (user.evidence || 0),
      0
    );

  const totalAchievements =
    users.reduce(
      (sum, user) =>
        sum + (user.achievements || 0),
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
        value: String(totalEvidence),
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
   أزرار النظام
========================= */

function buttons() {
  return [

    new ActionRowBuilder()
      .addComponents(

        new ButtonBuilder()
          .setCustomId("profile")
          .setLabel("ملفي")
          .setStyle(
            ButtonStyle.Primary
          ),

        new ButtonBuilder()
          .setCustomId("levels")
          .setLabel("المستويات")
          .setStyle(
            ButtonStyle.Secondary
          ),

        new ButtonBuilder()
          .setCustomId("leaderboard")
          .setLabel("المتصدرون")
          .setStyle(
            ButtonStyle.Secondary
          ),

        new ButtonBuilder()
          .setCustomId("rules")
          .setLabel("القوانين")
          .setStyle(
            ButtonStyle.Secondary
          )
      ),

    new ActionRowBuilder()
      .addComponents(

        new ButtonBuilder()
          .setCustomId("rewards")
          .setLabel("المكافآت")
          .setStyle(
            ButtonStyle.Secondary
          ),

        new ButtonBuilder()
          .setCustomId("shop")
          .setLabel("المتجر")
          .setStyle(
            ButtonStyle.Secondary
          ),

        new ButtonBuilder()
          .setCustomId("history")
          .setLabel("السجل")
          .setStyle(
            ButtonStyle.Secondary
          ),

        new ButtonBuilder()
          .setCustomId("stats")
          .setLabel("الإحصائيات")
          .setStyle(
            ButtonStyle.Secondary
          )
      )
  ];
}

/* =========================
   Slash Commands
========================= */

const commands = [

  new SlashCommandBuilder()
    .setName("reputation")
    .setDescription(
      "فتح نظام السمعة"
    ),

  new SlashCommandBuilder()
    .setName("profile")
    .setDescription(
      "عرض ملف اللاعب"
    ),

  new SlashCommandBuilder()
    .setName("levels")
    .setDescription(
      "عرض المستويات"
    ),

  new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription(
      "عرض المتصدرين"
    ),

  new SlashCommandBuilder()
    .setName("history")
    .setDescription(
      "عرض السجل"
    ),

  new SlashCommandBuilder()
    .setName("rewards")
    .setDescription(
      "عرض المكافآت"
    ),

  new SlashCommandBuilder()
    .setName("shop")
    .setDescription(
      "فتح المتجر"
    ),

  new SlashCommandBuilder()
    .setName("rules")
    .setDescription(
      "عرض القوانين"
    ),

  new SlashCommandBuilder()
    .setName("stats")
    .setDescription(
      "عرض الإحصائيات"
    ),

  new SlashCommandBuilder()
    .setName("proof")
    .setDescription(
      "رفع دليل"
    )

    .addStringOption(
      option =>
        option
          .setName("type")
          .setDescription(
            "نوع الدليل"
          )
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

    .addNumberOption(
      option =>
        option
          .setName("hours")
          .setDescription(
            "عدد الساعات"
          )
          .setRequired(false)
          .setMinValue(0.5)
          .setMaxValue(24)
    )

    .addAttachmentOption(
      option =>
        option
          .setName("evidence")
          .setDescription(
            "صورة أو فيديو"
          )
          .setRequired(true)
    )

    .addStringOption(
      option =>
        option
          .setName("description")
          .setDescription(
            "وصف الدليل"
          )
          .setRequired(true)
          .setMaxLength(1000)
    )

].map(
  command => command.toJSON()
);

/* =========================
   Discord Client
========================= */

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds
  ]
});

/* =========================
   تسجيل الأوامر تلقائيًا
========================= */

client.once(
  Events.ClientReady,
  async ready => {

    console.log(
      `تم تشغيل البوت: ${ready.user.tag}`
    );

    try {

      const rest =
        new REST({
          version: "10"
        }).setToken(TOKEN);

      /*
       * نأخذ ID البوت تلقائيًا
       * بدل الاعتماد على CLIENT_ID.
       */

      const application =
        await rest.get(
          Routes.oauth2CurrentApplication()
        );

      const clientId =
        application.id;

      /*
       * تسجيل الأوامر في جميع السيرفرات
       * التي يوجد فيها البوت.
       */

      const guilds =
        client.guilds.cache;

      console.log(
        `عدد السيرفرات: ${guilds.size}`
      );

      for (const guild of guilds.values()) {

        try {

          await rest.put(
            Routes.applicationGuildCommands(
              clientId,
              guild.id
            ),
            {
              body: commands
            }
          );

          console.log(
            `تم تسجيل الأوامر في: ${guild.name}`
          );

        } catch (error) {

          console.error(
            `فشل تسجيل الأوامر في ${guild.name}`,
            error
          );

        }

      }

      console.log(
        "اكتمل تسجيل أوامر Slash."
      );

    } catch (error) {

      console.error(
        "خطأ في تسجيل الأوامر:",
        error
      );

    }

  }
);

/* =========================
   الأوامر والتفاعلات
========================= */

client.on(
  Events.InteractionCreate,
  async interaction => {

    try {

      if (
        interaction.isChatInputCommand()
      ) {

        switch (
          interaction.commandName
        ) {

          case "reputation":

            return interaction.reply({

              embeds: [

                new EmbedBuilder()
                  .setColor(0x111111)
                  .setTitle(
                    "نظام السمعة"
                  )
                  .setDescription(
                    "اختر من القائمة الموجودة أسفل الرسالة."
                  )

              ],

              components: buttons()

            });

          case "profile":

            return interaction.reply({
              embeds: [
                profileEmbed(
                  interaction.user
                )
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
                leaderboardEmbed(
                  interaction.guild
                )
              ]
            });

          case "history":

            return interaction.reply({
              embeds: [
                historyEmbed(
                  interaction.user
                )
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

            if (
              !validEvidence(evidence)
            ) {

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
                  "اكتب عدد الساعات.",
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

            return interaction.reply({

              embeds: [

                new EmbedBuilder()
                  .setColor(0x111111)
                  .setTitle(
                    "تم تسجيل الدليل"
                  )
                  .setDescription(
                    `تم تسجيل الدليل مباشرة.\n\n` +
                    `النقاط المضافة: ${result.points}\n` +
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

        }

      }

      /* =========================
         الأزرار
      ========================= */

      if (
        interaction.isButton()
      ) {

        switch (
          interaction.customId
        ) {

          case "profile":

            return interaction.update({
              embeds: [
                profileEmbed(
                  interaction.user
                )
              ],
              components: buttons()
            });

          case "levels":

            return interaction.update({
              embeds: [
                levelsEmbed()
              ],
              components: buttons()
            });

          case "leaderboard":

            return interaction.update({
              embeds: [
                leaderboardEmbed(
                  interaction.guild
                )
              ],
              components: buttons()
            });

          case "rules":

            return interaction.update({
              embeds: [
                rulesEmbed()
              ],
              components: buttons()
            });

          case "rewards":

            return interaction.update({
              embeds: [
                rewardsEmbed()
              ],
              components: buttons()
            });

          case "shop":

            return interaction.update({
              embeds: [
                shopEmbed()
              ],
              components: buttons()
            });

          case "history":

            return interaction.reply({
              embeds: [
                historyEmbed(
                  interaction.user
                )
              ],
              ephemeral: true
            });

          case "stats":

            return interaction.update({
              embeds: [
                statsEmbed()
              ],
              components: buttons()
            });

        }

      }

    } catch (error) {

      console.error(
        "حدث خطأ:",
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
   سيرفر Render
========================= */

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
        "Reputation Bot is online."
      );

    }
  );

server.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      `Web server يعمل على المنفذ ${PORT}`
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
      "تم تسجيل دخول البوت."
    );

  })
  .catch(error => {

    console.error(
      "فشل تسجيل دخول البوت:",
      error
    );

    process.exit(1);

  });