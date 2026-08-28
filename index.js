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
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  AttachmentBuilder,
  ChannelType,
  PermissionFlagsBits,
  Events
} = require("discord.js");

const fs = require("fs");
const path = require("path");
const http = require("http");

/* =========================================================
   ENVIRONMENT VARIABLES
   ========================================================= */

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const PORT = Number(process.env.PORT || 3000);

if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
  throw new Error(
    "يجب إضافة DISCORD_TOKEN و CLIENT_ID و GUILD_ID في Environment Variables."
  );
}

/* =========================================================
   SETTINGS
   ========================================================= */

const ADMIN_ROLE_NAME = "Admin";

/*
   ضع ملف البانر بهذا الاسم بالضبط بجانب index.js

   banner.PNG
*/
const BANNER_FILE = path.join(__dirname, "banner.PNG");

/* =========================================================
   DATABASE
   ========================================================= */

const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "database.json");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, {
    recursive: true
  });
}

let database = {
  users: {}
};

if (fs.existsSync(DATA_FILE)) {
  try {
    database = JSON.parse(
      fs.readFileSync(DATA_FILE, "utf8")
    );
  } catch (error) {
    console.error(
      "تعذر قراءة قاعدة البيانات، سيتم إنشاء قاعدة جديدة."
    );

    database = {
      users: {}
    };
  }
}

if (!database.users) {
  database.users = {};
}

function saveDatabase() {
  try {
    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify(database, null, 2),
      "utf8"
    );
  } catch (error) {
    console.error(
      "Database save error:",
      error
    );
  }
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

/* =========================================================
   LEVELS
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
    LEVELS.find(
      level => level.points > points
    ) || null
  );
}

function formatHours(hours) {
  const minutes = Math.round(
    Number(hours || 0) * 60
  );

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

/* =========================================================
   HISTORY
   ========================================================= */

function addHistory(userId, action) {
  const user = getUser(userId);

  user.history.unshift({
    ...action,
    date: new Date().toISOString()
  });

  user.history =
    user.history.slice(0, 100);

  saveDatabase();
}

/* =========================================================
   EVIDENCE
   ========================================================= */

function isValidEvidence(attachment) {
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

function addProof(
  userId,
  type,
  hours,
  evidenceUrl,
  description
) {
  const user = getUser(userId);

  const oldLevel =
    getLevel(user.points);

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
    newLevel: getLevel(
      user.points
    ),
    pointsAdded
  };
}

/* =========================================================
   REPUTATION EMBEDS
   ========================================================= */

function profileEmbed(user) {
  const data =
    getUser(user.id);

  const level =
    getLevel(data.points);

  const next =
    getNextLevel(data.points);

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
        value: String(
          data.achievements
        ),
        inline: true
      },
      {
        name: "الأدلة",
        value: String(
          data.evidence
        ),
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
      text: "Rift Town • Reputation System"
    })
    .setTimestamp();
}

function levelsEmbed() {
  return new EmbedBuilder()
    .setColor(0x111111)
    .setTitle(
      "المستويات والمكافآت"
    )
    .setDescription(
      LEVELS.map(level =>
        `المستوى ${level.level} — ${level.name}\n` +
        `النقاط المطلوبة: ${level.points}\n` +
        `المكافأة: ${level.reward}`
      ).join("\n\n")
    )
    .setFooter({
      text: "Rift Town • Reputation System"
    });
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
    )
    .setFooter({
      text: "Rift Town • Rules"
    });
}

function rewardsEmbed() {
  return new EmbedBuilder()
    .setColor(0x111111)
    .setTitle("المكافآت")
    .setDescription(
      LEVELS
        .filter(level =>
          level.level > 1
        )
        .map(level =>
          `المستوى ${level.level}: ${level.reward}`
        )
        .join("\n\n") +
      "\n\nالمكافآت المالية يتم صرفها يوم الجمعة، ولا يقوم البوت بتحويل الأموال تلقائيًا."
    )
    .setFooter({
      text: "Rift Town • Rewards"
    });
}

function shopEmbed() {
  return new EmbedBuilder()
    .setColor(0x111111)
    .setTitle("المتجر")
    .setDescription(
      "متجر المكافآت.\n\n" +
      "مكافآت المستوى 8 والمستوى 9 والمستوى 10 يتم فتحها عن طريق المستوى ولا يتم شراؤها من المتجر.\n\n" +
      "يمكن إضافة عناصر تجميلية للمتجر لاحقًا."
    )
    .setFooter({
      text: "Rift Town • Shop"
    });
}

function historyEmbed(user) {
  const data =
    getUser(user.id);

  if (!data.history.length) {
    return new EmbedBuilder()
      .setColor(0x111111)
      .setTitle("السجل")
      .setDescription(
        "لا يوجد لديك نشاط مسجل حتى الآن."
      )
      .setFooter({
        text: "Rift Town • History"
      });
  }

  return new EmbedBuilder()
    .setColor(0x111111)
    .setTitle("سجل اللاعب")
    .setDescription(
      data.history
        .slice(0, 10)
        .map(
          (item, index) =>
            `${index + 1}. ${item.action}\n` +
            `النقاط: ${item.pointsAdded || 0}\n` +
            `الوصف: ${item.description || "بدون وصف"}`
        )
        .join("\n\n")
    )
    .setFooter({
      text: "Rift Town • History"
    });
}

function leaderboardEmbed(guild) {
  const players =
    Object.entries(
      database.users
    )
      .sort(
        (a, b) =>
          b[1].points -
          a[1].points
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

  const text =
    players
      .map(
        ([id, data], index) => {
          const member =
            guild.members.cache.get(id);

          const name =
            member
              ? member.displayName
              : `<@${id}>`;

          const level =
            getLevel(data.points);

          return (
            `${index + 1}. ${name} — ` +
            `المستوى ${level.level} — ` +
            `${data.points} نقطة`
          );
        }
      )
      .join("\n");

  return new EmbedBuilder()
    .setColor(0x111111)
    .setTitle("المتصدرون")
    .setDescription(text)
    .setFooter({
      text: "Rift Town • Leaderboard"
    });
}

function statsEmbed() {
  const users =
    Object.values(
      database.users
    );

  const totalHours =
    users.reduce(
      (sum, user) =>
        sum + (user.hours || 0),
      0
    );

  const totalProofs =
    users.reduce(
      (sum, user) =>
        sum + (user.evidence || 0),
      0
    );

  const totalAchievements =
    users.reduce(
      (sum, user) =>
        sum +
        (user.achievements || 0),
      0
    );

  return new EmbedBuilder()
    .setColor(0x111111)
    .setTitle(
      "إحصائيات النظام"
    )
    .addFields(
      {
        name: "عدد اللاعبين",
        value: String(
          users.length
        ),
        inline: true
      },
      {
        name: "إجمالي الساعات",
        value: formatHours(
          totalHours
        ),
        inline: true
      },
      {
        name: "إجمالي الأدلة",
        value: String(
          totalProofs
        ),
        inline: true
      },
      {
        name: "إجمالي الإنجازات",
        value: String(
          totalAchievements
        ),
        inline: true
      }
    )
    .setFooter({
      text: "Rift Town • Statistics"
    });
}

/* =========================================================
   REPUTATION BUTTONS
   ========================================================= */

function mainButtons() {
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

/* =========================================================
   ACTIVATION SYSTEM
   ========================================================= */

function bannerAttachment() {
  if (!fs.existsSync(BANNER_FILE)) {
    console.error(
      `لم يتم العثور على البانر: ${BANNER_FILE}`
    );

    return null;
  }

  return new AttachmentBuilder(
    BANNER_FILE,
    {
      name: "banner.png"
    }
  );
}

function activationEmbed() {
  return new EmbedBuilder()
    .setColor(0x111111)
    .setTitle(
      "RIFT TOWN | تفعيل الحساب"
    )
    .setDescription(
      "لتفعيل حسابك في السيرفر، اضغط على زر تفعيل الحساب الموجود بالأسفل.\n\n" +
      "بعد الضغط على الزر، سيظهر لك نموذج تكتب فيه PSN ID الخاص بك.\n\n" +
      "يجب كتابة PSN ID بشكل صحيح حتى يتم تسجيل الحساب."
    )
    .setImage(
      "attachment://banner.png"
    )
    .setFooter({
      text: "Rift Town • Account Activation"
    });
}

function activationButton() {
  return new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(
          "activate_account"
        )
        .setLabel(
          "تفعيل الحساب"
        )
        .setStyle(
          ButtonStyle.Success
        )
    );
}

/* =========================================================
   TICKET SYSTEM
   ========================================================= */

const TICKET_TYPES = {
  support: {
    name: "الدعم الفني",
    description:
      "للمشاكل والاستفسارات التقنية",
    category:
      "Support Tickets"
  },

  report: {
    name: "البلاغات",
    description:
      "للبلاغات والشكاوى",
    category:
      "Report Tickets"
  },

  management: {
    name: "الإدارة",
    description:
      "للتواصل مع إدارة السيرفر",
    category:
      "Management Tickets"
  },

  owner: {
    name: "المالك",
    description:
      "للتواصل مع مالك السيرفر",
    category:
      "Owner Tickets"
  }
};

/* =========================================================
   TICKET PANEL
   ========================================================= */

function ticketPanelEmbed() {
  return new EmbedBuilder()
    .setColor(0x111111)
    .setTitle(
      "RIFT TOWN | نظام التذاكر"
    )
    .setDescription(
      "مرحبًا بك في نظام التذاكر.\n\n" +
      "اختر نوع التذكرة المناسب من القائمة الموجودة بالأسفل.\n\n" +
      "سيتم إنشاء قناة خاصة لك لمتابعة طلبك مع المسؤولين.\n\n" +
      "اختر القسم المناسب فقط، واكتب تفاصيل طلبك بشكل واضح."
    )
    .setImage(
      "attachment://banner.png"
    )
    .setFooter({
      text: "Rift Town • Ticket System"
    });
}

/* =========================================================
   TICKET SELECT MENU
   ========================================================= */

function ticketSelectRow() {
  const menu =
    new StringSelectMenuBuilder()
      .setCustomId(
        "ticket_select"
      )
      .setPlaceholder(
        "اختر نوع التذكرة"
      )
      .addOptions(
        Object.entries(
          TICKET_TYPES
        ).map(
          ([value, ticket]) => ({
            label:
              ticket.name,
            description:
              ticket.description,
            value
          })
        )
      );

  return new ActionRowBuilder()
    .addComponents(menu);
}

/* =========================================================
   TICKET CLOSE BUTTON
   ========================================================= */

function ticketCloseRow() {
  return new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(
          "ticket_close"
        )
        .setLabel(
          "إغلاق التذكرة"
        )
        .setStyle(
          ButtonStyle.Danger
        )
    );
}

/* =========================================================
   SAFE CHANNEL NAME
   ========================================================= */

function safeChannelName(text) {
  return String(
    text || "user"
  )
    .toLowerCase()
    .replace(
      /[^a-z0-9-_]/g,
      "-"
    )
    .replace(
      /-+/g,
      "-"
    )
    .replace(
      /^-|-$/g,
      ""
    )
    .slice(0, 18) || "user";
}

/* =========================================================
   ADMIN ROLE
   ========================================================= */

function getAdminRole(guild) {
  return (
    guild.roles.cache.find(
      role =>
        role.name ===
        ADMIN_ROLE_NAME
    ) || null
  );
}

/* =========================================================
   CREATE CATEGORY
   ========================================================= */

async function getOrCreateTicketCategory(
  guild,
  categoryName
) {
  const existing =
    guild.channels.cache.find(
      channel =>
        channel.type ===
          ChannelType.GuildCategory &&
        channel.name ===
          categoryName
    );

  if (existing) {
    return existing;
  }

  return guild.channels.create({
    name: categoryName,
    type:
      ChannelType.GuildCategory,
    reason:
      `Rift Town ticket category - ${categoryName}`
  });
}

/* =========================================================
   CREATE TICKET
   ========================================================= */

async function createTicket(
  interaction,
  type
) {
  try {
    const ticket =
      TICKET_TYPES[type];

    if (!ticket) {
      return interaction.reply({
        content:
          "نوع التذكرة غير صالح.",
        ephemeral: true
      });
    }

    const guild =
      interaction.guild;

    const user =
      interaction.user;

    if (!guild) {
      return interaction.reply({
        content:
          "لا يمكن إنشاء التذكرة هنا.",
        ephemeral: true
      });
    }

    /* -----------------------------------------------------
       CHECK EXISTING TICKET
       ----------------------------------------------------- */

    const existing =
      guild.channels.cache.find(
        channel =>
          channel.topic ===
          `rift-ticket:${user.id}:${type}`
      );

    if (existing) {
      return interaction.reply({
        content:
          `لديك تذكرة مفتوحة بالفعل: ${existing}`,
        ephemeral: true
      });
    }

    /* -----------------------------------------------------
       CATEGORY
       ----------------------------------------------------- */

    const category =
      await getOrCreateTicketCategory(
        guild,
        ticket.category
      );

    /* -----------------------------------------------------
       ADMIN ROLE
       ----------------------------------------------------- */

    const adminRole =
      getAdminRole(guild);

    /* -----------------------------------------------------
       PERMISSIONS
       ----------------------------------------------------- */

    const permissionOverwrites = [
      {
        id:
          guild.roles.everyone.id,

        deny: [
          PermissionFlagsBits.ViewChannel
        ]
      },

      {
        id: user.id,

        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.EmbedLinks
        ]
      }
    ];

    /* -----------------------------------------------------
       ADMIN ACCESS
       ----------------------------------------------------- */

    if (adminRole) {
      permissionOverwrites.push({
        id: adminRole.id,

        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.ManageChannels,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.EmbedLinks
        ]
      });
    }

    /* -----------------------------------------------------
       CHANNEL NAME
       ----------------------------------------------------- */

    const channelName =
      `${type}-${safeChannelName(
        user.username
      )}`;

    /* -----------------------------------------------------
       CREATE CHANNEL
       ----------------------------------------------------- */

    const channel =
      await guild.channels.create({
        name: channelName,

        type:
          ChannelType.GuildText,

        parent:
          category.id,

        topic:
          `rift-ticket:${user.id}:${type}`,

        permissionOverwrites,

        reason:
          `Rift Town - ${ticket.name}`
      });

    /* -----------------------------------------------------
       TICKET EMBED
       ----------------------------------------------------- */

    const embed =
      new EmbedBuilder()
        .setColor(0x111111)

        .setTitle(
          `RIFT TOWN | ${ticket.name}`
        )

        .setDescription(
          `مرحبًا ${user}.\n\n` +
          `تم إنشاء تذكرة ${ticket.name} بنجاح.\n\n` +
          `${ticket.description}.\n\n` +
          "اكتب تفاصيل طلبك بشكل واضح، وسيقوم المسؤولون بالرد عليك.\n\n" +
          "عند الانتهاء من الطلب، يمكن إغلاق التذكرة من خلال الزر الموجود بالأسفل."
        )

        .addFields({
          name:
            "صاحب التذكرة",
          value:
            `${user}`,
          inline: true
        })

        .addFields({
          name:
            "نوع التذكرة",
          value:
            ticket.name,
          inline: true
        })

        .setFooter({
          text:
            "Rift Town • Ticket System"
        })

        .setTimestamp();

    /* -----------------------------------------------------
       SEND TICKET MESSAGE
       ----------------------------------------------------- */

    let content =
      `${user}`;

    if (adminRole) {
      content +=
        ` <@&${adminRole.id}>`;
    }

    await channel.send({
      content,

      embeds: [
        embed
      ],

      components: [
        ticketCloseRow()
      ]
    });

    /* -----------------------------------------------------
       REPLY
       ----------------------------------------------------- */

    return interaction.reply({
      content:
        `تم إنشاء التذكرة بنجاح: ${channel}`,
      ephemeral: true
    });

  } catch (error) {
    console.error(
      "Create ticket error:",
      error
    );

    if (
      !interaction.replied &&
      !interaction.deferred
    ) {
      return interaction.reply({
        content:
          "حدث خطأ أثناء إنشاء التذكرة. تأكد من صلاحيات البوت.",
        ephemeral: true
      });
    }
  }
}

/* =========================================================
   SLASH COMMANDS
   ========================================================= */

const commands = [

  /* -------------------------------------------------------
     ACCOUNT SETUP
     ------------------------------------------------------- */

  new SlashCommandBuilder()
    .setName("setup")
    .setDescription(
      "إرسال لوحة تفعيل الحساب"
    ),

  /* -------------------------------------------------------
     TICKETS
     ------------------------------------------------------- */

  new SlashCommandBuilder()
    .setName("tickets")
    .setDescription(
      "نظام تذاكر Rift Town"
    )
    .addSubcommand(
      sub =>
        sub
          .setName("setup")
          .setDescription(
            "إرسال لوحة التذاكر"
          )
    ),

  /* -------------------------------------------------------
     REPUTATION
     ------------------------------------------------------- */

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
      "عرض المستويات والمكافآت"
    ),

  new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription(
      "عرض المتصدرين"
    ),

  new SlashCommandBuilder()
    .setName("history")
    .setDescription(
      "عرض سجل اللاعب"
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
      "عرض إحصائيات النظام"
    ),

  /* -------------------------------------------------------
     PROOF
     ------------------------------------------------------- */

  new SlashCommandBuilder()
    .setName("proof")
    .setDescription(
      "رفع دليل وإضافة النقاط"
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
              name:
                "ساعات رول بلاي",
              value:
                "hours"
            },
            {
              name:
                "مساعدة لاعب",
              value:
                "help"
            },
            {
              name:
                "تواجد في جيم",
              value:
                "game"
            },
            {
              name:
                "إنجاز",
              value:
                "achievement"
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
            "ارفع صورة أو فيديو للدليل"
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
  command =>
    command.toJSON()
);

/* =========================================================
   DISCORD CLIENT
   ========================================================= */

const client =
  new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers
    ]
  });

/* =========================================================
   REGISTER COMMANDS
   ========================================================= */

async function registerCommands() {
  const rest =
    new REST({
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

    console.log(
      "الأوامر المسجلة تشمل /setup و /tickets setup ونظام السمعة."
    );

  } catch (error) {
    console.error(
      "فشل تسجيل أوامر Slash:",
      error
    );
  }
}

/* =========================================================
   READY
   ========================================================= */

client.once(
  Events.ClientReady,
  async readyClient => {

    console.log(
      `تم تشغيل البوت: ${readyClient.user.tag}`
    );

    await registerCommands();
  }
);

/* =========================================================
   INTERACTIONS
   ========================================================= */

client.on(
  Events.InteractionCreate,
  async interaction => {

    try {

      /* ===================================================
         SLASH COMMANDS
         =================================================== */

      if (
        interaction.isChatInputCommand()
      ) {

        /* ===============================================
           /setup
           =============================================== */

        if (
          interaction.commandName ===
          "setup"
        ) {

          const attachment =
            bannerAttachment();

          if (!attachment) {
            return interaction.reply({
              content:
                "لم يتم العثور على البانر.\n\n" +
                "اسم الملف المطلوب بالضبط:\n" +
                "banner.png",
              ephemeral: true
            });
          }

          return interaction.reply({
            embeds: [
              activationEmbed()
            ],

            components: [
              activationButton()
            ],

            files: [
              attachment
            ]
          });
        }

        /* ===============================================
           /tickets setup
           =============================================== */

        if (
          interaction.commandName ===
            "tickets" &&
          interaction.options.getSubcommand() ===
            "setup"
        ) {

          const attachment =
            bannerAttachment();

          if (!attachment) {
            return interaction.reply({
              content:
                "لم يتم العثور على البانر.\n\n" +
                "اسم الملف المطلوب بالضبط:\n" +
                "banner.png",
              ephemeral: true
            });
          }

          return interaction.reply({
            embeds: [
              ticketPanelEmbed()
            ],

            components: [
              ticketSelectRow()
            ],

            files: [
              attachment
            ]
          });
        }

        /* ===============================================
           /reputation
           =============================================== */

        if (
          interaction.commandName ===
          "reputation"
        ) {

          return interaction.reply({
            embeds: [
              new EmbedBuilder()
                .setColor(0x111111)
                .setTitle(
                  "RIFT TOWN | نظام السمعة"
                )
                .setDescription(
                  "مرحبًا بك في نظام السمعة والمستويات.\n\n" +
                  "يمكنك استخدام الأزرار الموجودة بالأسفل لعرض ملفك، المستويات، المتصدرين، القوانين، المكافآت، المتجر والسجل."
                )
                .setFooter({
                  text:
                    "Rift Town • Reputation System"
                })
            ],

            components:
              mainButtons()
          });
        }

        /* ===============================================
           /profile
           =============================================== */

        if (
          interaction.commandName ===
          "profile"
        ) {

          return interaction.reply({
            embeds: [
              profileEmbed(
                interaction.user
              )
            ]
          });
        }

        /* ===============================================
           /levels
           =============================================== */

        if (
          interaction.commandName ===
          "levels"
        ) {

          return interaction.reply({
            embeds: [
              levelsEmbed()
            ]
          });
        }

        /* ===============================================
           /leaderboard
           =============================================== */

        if (
          interaction.commandName ===
          "leaderboard"
        ) {

          return interaction.reply({
            embeds: [
              leaderboardEmbed(
                interaction.guild
              )
            ]
          });
        }

        /* ===============================================
           /history
           =============================================== */

        if (
          interaction.commandName ===
          "history"
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

        /* ===============================================
           /rewards
           =============================================== */

        if (
          interaction.commandName ===
          "rewards"
        ) {

          return interaction.reply({
            embeds: [
              rewardsEmbed()
            ]
          });
        }

        /* ===============================================
           /shop
           =============================================== */

        if (
          interaction.commandName ===
          "shop"
        ) {

          return interaction.reply({
            embeds: [
              shopEmbed()
            ]
          });
        }

        /* ===============================================
           /rules
           =============================================== */

        if (
          interaction.commandName ===
          "rules"
        ) {

          return interaction.reply({
            embeds: [
              rulesEmbed()
            ]
          });
        }

        /* ===============================================
           /stats
           =============================================== */

        if (
          interaction.commandName ===
          "stats"
        ) {

          return interaction.reply({
            embeds: [
              statsEmbed()
            ]
          });
        }

        /* ===============================================
           /proof
           =============================================== */

        if (
          interaction.commandName ===
          "proof"
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

          if (
            !isValidEvidence(
              evidence
            )
          ) {

            return interaction.reply({
              content:
                "يجب رفع صورة أو فيديو فقط.",
              ephemeral: true
            });
          }

          if (
            type === "hours" &&
            (!hours ||
              hours <= 0)
          ) {

            return interaction.reply({
              content:
                "يجب كتابة عدد الساعات.",
              ephemeral: true
            });
          }

          const result =
            addProof(
              interaction.user.id,
              type,
              hours,
              evidence.url,
              description
            );

          const levelUp =
            result.newLevel.level >
            result.oldLevel.level;

          let descriptionText =
            "تم تسجيل الدليل مباشرة.\n\n" +
            `النقاط المضافة: ${result.pointsAdded}\n` +
            `المستوى الحالي: ${result.newLevel.level}`;

          if (levelUp) {
            descriptionText +=
              `\nتمت الترقية من المستوى ${result.oldLevel.level} إلى المستوى ${result.newLevel.level}.`;
          }

          return interaction.reply({
            embeds: [
              new EmbedBuilder()
                .setColor(0x111111)
                .setTitle(
                  "تم تسجيل الدليل"
                )
                .setDescription(
                  descriptionText
                )
                .addFields({
                  name:
                    "الدليل",
                  value:
                    `[فتح الدليل](${evidence.url})`
                })
                .setFooter({
                  text:
                    "Rift Town • Reputation System"
                })
                .setTimestamp()
            ],

            ephemeral: true
          });
        }
      }

      /* ===================================================
         ACTIVATION BUTTON
         =================================================== */

      if (
        interaction.isButton() &&
        interaction.customId ===
          "activate_account"
      ) {

        const modal =
          new ModalBuilder()
            .setCustomId(
              "activation_modal"
            )
            .setTitle(
              "Rift Town | تفعيل الحساب"
            );

        const input =
          new TextInputBuilder()
            .setCustomId(
              "psn"
            )
            .setLabel(
              "PSN ID"
            )
            .setPlaceholder(
              "اكتب PSN ID الخاص بك"
            )
            .setStyle(
              TextInputStyle.Short
            )
            .setMinLength(2)
            .setMaxLength(32)
            .setRequired(true);

        modal.addComponents(
          new ActionRowBuilder()
            .addComponents(
              input
            )
        );

        return interaction.showModal(
          modal
        );
      }

      /* ===================================================
         ACTIVATION MODAL
         =================================================== */

      if (
        interaction.isModalSubmit() &&
        interaction.customId ===
          "activation_modal"
      ) {

        await interaction.deferReply({
          ephemeral: true
        });

        const psn =
          interaction.fields
            .getTextInputValue(
              "psn"
            )
            .trim();

        /* -----------------------------------------------
           VALIDATE PSN
           ----------------------------------------------- */

        if (
          !/^[A-Za-z0-9_.-]{2,32}$/.test(
            psn
          )
        ) {

          return interaction.editReply(
            "PSN ID غير صالح.\n" +
            "استخدم الأحرف والأرقام و _ أو - أو . فقط."
          );
        }

        /* -----------------------------------------------
           MEMBER
           ----------------------------------------------- */

        const member =
          await interaction.guild.members.fetch(
            interaction.user.id
          );

        /* -----------------------------------------------
           ACTIVATED ROLE
           ----------------------------------------------- */

        const roleName =
          "مفعل";

        let role =
          interaction.guild.roles.cache.find(
            r =>
              r.name ===
              roleName
          );

        if (!role) {

          role =
            await interaction.guild.roles.create({
              name:
                roleName,

              reason:
                "Rift Town account activation"
            });
        }

        /* -----------------------------------------------
           BOT ROLE POSITION
           ----------------------------------------------- */

        const botMember =
          interaction.guild.members.me ||
          await interaction.guild.members.fetchMe();

        if (
          role.position >=
          botMember.roles.highest.position
        ) {

          return interaction.editReply(
            "ارفع رتبة البوت فوق رتبة مفعل من إعدادات السيرفر."
          );
        }

        /* -----------------------------------------------
           ADD ROLE
           ----------------------------------------------- */

        await member.roles.add(
          role,
          "Rift Town account activation"
        );

        /* -----------------------------------------------
           NICKNAME
           ----------------------------------------------- */

        try {

          await member.setNickname(
            psn,
            "Rift Town PSN activation"
          );

        } catch (error) {

          console.log(
            "تعذر تغيير الاسم:",
            error.message
          );
        }

        /* -----------------------------------------------
           SUCCESS
           ----------------------------------------------- */

        return interaction.editReply(
          "تم التفعيل بنجاح.\n\n" +
          `PSN ID: ${psn}\n` +
          `الرتبة: ${roleName}`
        );
      }

      /* ===================================================
         TICKET SELECT MENU
         =================================================== */

      if (
        interaction.isStringSelectMenu() &&
        interaction.customId ===
          "ticket_select"
      ) {

        const type =
          interaction.values[0];

        return createTicket(
          interaction,
          type
        );
      }

      /* ===================================================
         TICKET CLOSE
         =================================================== */

      if (
        interaction.isButton() &&
        interaction.customId ===
          "ticket_close"
      ) {

        if (
          !interaction.channel ||
          !interaction.channel.isTextBased()
        ) {

          return interaction.reply({
            content:
              "لا يمكن إغلاق هذه القناة.",
            ephemeral: true
          });
        }

        /* -----------------------------------------------
           ADMIN ROLE
           ----------------------------------------------- */

        const adminRole =
          getAdminRole(
            interaction.guild
          );

        const isAdmin =
          adminRole
            ? interaction.member.roles.cache.has(
                adminRole.id
              )
            : false;

        /* -----------------------------------------------
           TICKET OWNER
           ----------------------------------------------- */

        const topic =
          String(
            interaction.channel.topic ||
            ""
          );

        let ownerId = null;

        if (
          topic.startsWith(
            "rift-ticket:"
          )
        ) {

          const parts =
            topic.split(":");

          ownerId =
            parts[1] ||
            null;
        }

        /* -----------------------------------------------
           PERMISSION
           ----------------------------------------------- */

        if (
          !isAdmin &&
          String(
            interaction.user.id
          ) !==
            String(ownerId)
        ) {

          return interaction.reply({
            content:
              "ليس لديك صلاحية لإغلاق هذه التذكرة.",
            ephemeral: true
          });
        }

        /* -----------------------------------------------
           CLOSE MESSAGE
           ----------------------------------------------- */

        await interaction.reply(
          "سيتم إغلاق التذكرة خلال 3 ثوانٍ."
        );

        /* -----------------------------------------------
           DELETE CHANNEL
           ----------------------------------------------- */

        setTimeout(
          async () => {

            try {

              await interaction.channel.delete(
                "Rift Town - Ticket closed"
              );

            } catch (error) {

              console.error(
                "Ticket delete error:",
                error.message
              );
            }

          },
          3000
        );

        return;
      }

      /* ===================================================
         BUTTONS
         =================================================== */

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
              components:
                mainButtons()
            });

          case "levels":

            return interaction.update({
              embeds: [
                levelsEmbed()
              ],
              components:
                mainButtons()
            });

          case "leaderboard":

            return interaction.update({
              embeds: [
                leaderboardEmbed(
                  interaction.guild
                )
              ],
              components:
                mainButtons()
            });

          case "rules":

            return interaction.update({
              embeds: [
                rulesEmbed()
              ],
              components:
                mainButtons()
            });

          case "rewards":

            return interaction.update({
              embeds: [
                rewardsEmbed()
              ],
              components:
                mainButtons()
            });

          case "shop":

            return interaction.update({
              embeds: [
                shopEmbed()
              ],
              components:
                mainButtons()
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
              components:
                mainButtons()
            });

          default:
            return;
        }
      }

    } catch (error) {

      console.error(
        "حدث خطأ أثناء تنفيذ التفاعل:",
        error
      );

      try {

        if (
          interaction.deferred
        ) {

          await interaction.editReply({
            content:
              "حدث خطأ أثناء تنفيذ الطلب."
          });

        } else if (
          interaction.replied
        ) {

          await interaction.followUp({
            content:
              "حدث خطأ أثناء تنفيذ الطلب.",
            ephemeral: true
          });

        } else {

          await interaction.reply({
            content:
              "حدث خطأ أثناء تنفيذ الطلب.",
            ephemeral: true
          });

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
   WEB SERVER
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
        "Rift Town Bot is online."
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

server.on(
  "error",
  error => {

    console.error(
      "Web server error:",
      error
    );
  }
);

/* =========================================================
   LOGIN
   ========================================================= */

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