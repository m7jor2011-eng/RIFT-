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

/* =========================================================
   ENV
   ========================================================= */

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const PORT = Number(process.env.PORT || 3000);

/* =========================================================
   CHECK ENV
   ========================================================= */

if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
  throw new Error(
    "Missing DISCORD_TOKEN, CLIENT_ID, or GUILD_ID."
  );
}

/* =========================================================
   DATA
   ========================================================= */

const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "reputation.json");

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
    const saved = fs.readFileSync(
      DATA_FILE,
      "utf8"
    );

    database = JSON.parse(saved);

    if (!database.users) {
      database.users = {};
    }
  } catch (error) {
    console.error(
      "Could not read database:",
      error.message
    );

    database = {
      users: {}
    };
  }
}

/* =========================================================
   SAVE DATABASE
   ========================================================= */

function saveDatabase() {
  try {
    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify(database, null, 2),
      "utf8"
    );
  } catch (error) {
    console.error(
      "Could not save database:",
      error.message
    );
  }
}

/* =========================================================
   USER DATA
   ========================================================= */

function getUserData(userId) {
  if (!database.users[userId]) {
    database.users[userId] = {
      rp: {
        points: 0,
        hours: 0
      },

      discord: {
        points: 0,
        hours: 0
      },

      achievements: 0,
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
    name: "Member",
    points: 0
  },

  {
    level: 2,
    name: "Trusted Member",
    points: 10
  },

  {
    level: 3,
    name: "Experienced Member",
    points: 20
  },

  {
    level: 4,
    name: "Senior Member",
    points: 40
  },

  {
    level: 5,
    name: "Advanced Member",
    points: 60
  },

  {
    level: 6,
    name: "Elite Member",
    points: 80
  },

  {
    level: 7,
    name: "Legend Member",
    points: 100
  },

  {
    level: 8,
    name: "Master Member",
    points: 120
  },

  {
    level: 9,
    name: "Grand Master",
    points: 150
  },

  {
    level: 10,
    name: "Supreme Member",
    points: 200
  }
];

/* =========================================================
   GET LEVEL
   ========================================================= */

function getLevel(points) {
  let currentLevel = LEVELS[0];

  for (const level of LEVELS) {
    if (points >= level.points) {
      currentLevel = level;
    }
  }

  return currentLevel;
}

/* =========================================================
   NEXT LEVEL
   ========================================================= */

function getNextLevel(points) {
  return LEVELS.find(
    level => level.points > points
  ) || null;
}

/* =========================================================
   FORMAT HOURS
   ========================================================= */

function formatHours(hours) {
  const totalMinutes = Math.round(
    Number(hours) * 60
  );

  const h = Math.floor(
    totalMinutes / 60
  );

  const m = totalMinutes % 60;

  if (h === 0) {
    return `${m}m`;
  }

  if (m === 0) {
    return `${h}h`;
  }

  return `${h}h ${m}m`;
}

/* =========================================================
   PROGRESS
   ========================================================= */

function getProgressText(points) {
  const current = getLevel(points);
  const next = getNextLevel(points);

  if (!next) {
    return `Level ${current.level} — MAX`;
  }

  return (
    `${points} / ${next.points} points`
  );
}

/* =========================================================
   HISTORY
   ========================================================= */

function addHistory(userId, entry) {
  const data = getUserData(userId);

  data.history.unshift({
    ...entry,
    date: new Date().toISOString()
  });

  data.history =
    data.history.slice(0, 100);
}

/* =========================================================
   ADD RP HOURS
   ========================================================= */

function addRPHours(
  userId,
  hours,
  evidenceUrl,
  description
) {
  const data = getUserData(userId);

  const oldLevel =
    getLevel(data.rp.points);

  const points =
    Math.floor(Number(hours));

  data.rp.hours += Number(hours);
  data.rp.points += points;

  addHistory(userId, {
    action: "RP Hours",
    hours: Number(hours),
    pointsAdded: points,
    evidence: evidenceUrl,
    description
  });

  saveDatabase();

  const newLevel =
    getLevel(data.rp.points);

  return {
    oldLevel,
    newLevel,
    points
  };
}

/* =========================================================
   ADD DISCORD HOURS
   ========================================================= */

function addDiscordHours(
  userId,
  hours,
  evidenceUrl,
  description
) {
  const data = getUserData(userId);

  const oldLevel =
    getLevel(data.discord.points);

  const points =
    Math.floor(Number(hours));

  data.discord.hours += Number(hours);
  data.discord.points += points;

  addHistory(userId, {
    action: "Discord Hours",
    hours: Number(hours),
    pointsAdded: points,
    evidence: evidenceUrl,
    description
  });

  saveDatabase();

  const newLevel =
    getLevel(data.discord.points);

  return {
    oldLevel,
    newLevel,
    points
  };
}

/* =========================================================
   ADD ACHIEVEMENT
   ========================================================= */

function addAchievement(
  userId,
  description,
  evidenceUrl
) {
  const data = getUserData(userId);

  const oldLevel =
    getLevel(data.rp.points);

  data.achievements += 1;
  data.rp.points += 1;

  addHistory(userId, {
    action: "Achievement",
    pointsAdded: 1,
    evidence: evidenceUrl,
    description
  });

  saveDatabase();

  const newLevel =
    getLevel(data.rp.points);

  return {
    oldLevel,
    newLevel
  };
}

/* =========================================================
   PROFILE EMBED
   ========================================================= */

function createProfileEmbed(user) {
  const data =
    getUserData(user.id);

  const rpLevel =
    getLevel(data.rp.points);

  const discordLevel =
    getLevel(data.discord.points);

  return new EmbedBuilder()
    .setColor(0x111111)
    .setTitle("Reputation Profile")
    .setDescription(
      `Citizen: ${user}\n\n` +
      "RP Reputation و Discord Reputation مستقلان عن بعضهما."
    )
    .addFields(
      {
        name: "RP Reputation",
        value:
          `Level: ${rpLevel.level}\n` +
          `Rank: ${rpLevel.name}\n` +
          `Points: ${getProgressText(data.rp.points)}\n` +
          `Hours: ${formatHours(data.rp.hours)}`,
        inline: true
      },

      {
        name: "Discord Reputation",
        value:
          `Level: ${discordLevel.level}\n` +
          `Rank: ${discordLevel.name}\n` +
          `Points: ${getProgressText(data.discord.points)}\n` +
          `Hours: ${formatHours(data.discord.hours)}`,
        inline: true
      },

      {
        name: "Achievements",
        value:
          String(data.achievements),
        inline: true
      }
    )
    .setFooter({
      text: "Reputation System"
    })
    .setTimestamp();
}

/* =========================================================
   MAIN PANEL
   ========================================================= */

function createMainPanel() {
  return new EmbedBuilder()
    .setColor(0x111111)
    .setTitle("Reputation Levels")
    .setDescription(
      "نظام السمعة والمستويات.\n\n" +
      "ارفع دليلاً على ساعات تواجدك أو إنجازاتك.\n" +
      "بمجرد إرسال الدليل تتم إضافة الساعات والنقاط مباشرة.\n\n" +
      "لا توجد موافقة أو رفض من الإدارة."
    )
    .addFields(
      {
        name: "RP Reputation",
        value:
          "التواجد والالتزام داخل الرول بلاي."
      },

      {
        name: "Discord Reputation",
        value:
          "التواجد والنشاط والالتزام داخل الديسكورد."
      },

      {
        name: "Evidence",
        value:
          "كل إضافة للساعات أو الإنجازات تحتاج صورة أو فيديو كدليل."
      }
    )
    .setFooter({
      text: "Reputation System"
    });
}

/* =========================================================
   MAIN BUTTONS
   ========================================================= */

function createMainButtons() {
  const row1 =
    new ActionRowBuilder()
      .addComponents(

        new ButtonBuilder()
          .setCustomId("rp_hours")
          .setLabel("Add RP Hours")
          .setStyle(
            ButtonStyle.Primary
          ),

        new ButtonBuilder()
          .setCustomId("discord_hours")
          .setLabel("Add Discord Hours")
          .setStyle(
            ButtonStyle.Primary
          ),

        new ButtonBuilder()
          .setCustomId("achievement")
          .setLabel("Add Achievement")
          .setStyle(
            ButtonStyle.Secondary
          )
      );

  const row2 =
    new ActionRowBuilder()
      .addComponents(

        new ButtonBuilder()
          .setCustomId("profile")
          .setLabel("My Profile")
          .setStyle(
            ButtonStyle.Secondary
          ),

        new ButtonBuilder()
          .setCustomId("level_list")
          .setLabel("Levels")
          .setStyle(
            ButtonStyle.Secondary
          ),

        new ButtonBuilder()
          .setCustomId("rewards")
          .setLabel("Rewards")
          .setStyle(
            ButtonStyle.Secondary
          )
      );

  return [
    row1,
    row2
  ];
}

/* =========================================================
   LEVELS EMBED
   ========================================================= */

function createLevelsEmbed() {
  return new EmbedBuilder()
    .setColor(0x111111)
    .setTitle("Reputation Levels")
    .setDescription(
      LEVELS.map(level =>
        `Level ${level.level} — ${level.name}\n` +
        `Required Points: ${level.points}`
      ).join("\n\n")
    );
}

/* =========================================================
   REWARDS EMBED
   ========================================================= */

function createRewardsEmbed() {
  return new EmbedBuilder()
    .setColor(0x111111)
    .setTitle("Reputation Rewards")
    .setDescription(
      "Level 3 — أولوية بسيطة + 5,000$\n\n" +
      "Level 5 — أولوية أعلى + 15,000$\n\n" +
      "Level 7 — أولوية عالية + 35,000$\n\n" +
      "Level 10 — أولوية قصوى + 100,000$\n\n" +
      "المميزات النهائية يحددها الأونر."
    );
}

/* =========================================================
   COMMANDS
   ========================================================= */

const commands = [

  new SlashCommandBuilder()
    .setName("reputation")
    .setDescription(
      "فتح نظام Reputation Levels"
    ),

  new SlashCommandBuilder()
    .setName("rep")
    .setDescription(
      "عرض ملف السمعة"
    ),

  new SlashCommandBuilder()
    .setName("levels")
    .setDescription(
      "عرض مستويات السمعة"
    ),

  new SlashCommandBuilder()
    .setName("proof")
    .setDescription(
      "رفع دليل وإضافة الساعات أو الإنجاز مباشرة"
    )

    .addStringOption(option =>
      option
        .setName("type")
        .setDescription(
          "نوع الدليل"
        )
        .setRequired(true)
        .addChoices(
          {
            name: "RP Hours",
            value: "rp"
          },

          {
            name: "Discord Hours",
            value: "discord"
          },

          {
            name: "Achievement",
            value: "achievement"
          }
        )
    )

    .addNumberOption(option =>
      option
        .setName("hours")
        .setDescription(
          "عدد الساعات"
        )
        .setRequired(false)
        .setMinValue(0.5)
        .setMaxValue(24)
    )

    .addAttachmentOption(option =>
      option
        .setName("evidence")
        .setDescription(
          "صورة أو فيديو كدليل"
        )
        .setRequired(true)
    )

    .addStringOption(option =>
      option
        .setName("description")
        .setDescription(
          "شرح الدليل"
        )
        .setRequired(true)
        .setMaxLength(1000)
    )

].map(command =>
  command.toJSON()
);

/* =========================================================
   CLIENT
   ========================================================= */

const client =
  new Client({
    intents: [
      GatewayIntentBits.Guilds
    ]
  });

/* =========================================================
   READY
   ========================================================= */

client.once(
  Events.ClientReady,
  async readyClient => {

    console.log(
      `Bot online as ${readyClient.user.tag}`
    );

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
        "Slash commands registered successfully."
      );

    } catch (error) {

      console.error(
        "Command registration failed:",
        error
      );
    }
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

        /* -----------------------------------------------
           REPUTATION
           ----------------------------------------------- */

        if (
          interaction.commandName ===
            "reputation" ||
          interaction.commandName ===
            "rep"
        ) {

          return interaction.reply({
            embeds: [
              createProfileEmbed(
                interaction.user
              )
            ],

            components:
              createMainButtons()
          });
        }

        /* -----------------------------------------------
           LEVELS
           ----------------------------------------------- */

        if (
          interaction.commandName ===
          "levels"
        ) {

          return interaction.reply({
            embeds: [
              createLevelsEmbed()
            ]
          });
        }

        /* -----------------------------------------------
           PROOF
           ----------------------------------------------- */

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

          /* ---------------------------------------------
             CHECK EVIDENCE
             --------------------------------------------- */

          if (!evidence) {

            return interaction.reply({
              content:
                "يجب رفع صورة أو فيديو كدليل.",
              ephemeral: true
            });
          }

          /* ---------------------------------------------
             CHECK FILE TYPE
             --------------------------------------------- */

          const contentType =
            evidence.contentType || "";

          const isImage =
            contentType.startsWith(
              "image/"
            );

          const isVideo =
            contentType.startsWith(
              "video/"
            );

          if (
            !isImage &&
            !isVideo
          ) {

            return interaction.reply({
              content:
                "الدليل يجب أن يكون صورة أو فيديو.",
              ephemeral: true
            });
          }

          /* ---------------------------------------------
             RP HOURS
             --------------------------------------------- */

          if (type === "rp") {

            if (
              !hours ||
              hours <= 0
            ) {

              return interaction.reply({
                content:
                  "اكتب عدد ساعات RP.",
                ephemeral: true
              });
            }

            const result =
              addRPHours(
                interaction.user.id,
                hours,
                evidence.url,
                description
              );

            let levelMessage =
              `RP Level: ${result.newLevel.level}`;

            if (
              result.newLevel.level >
              result.oldLevel.level
            ) {

              levelMessage +=
                `\nLevel Up: ${result.oldLevel.level} → ${result.newLevel.level}`;
            }

            return interaction.reply({
              embeds: [
                new EmbedBuilder()
                  .setColor(0x111111)
                  .setTitle(
                    "RP Reputation Added"
                  )
                  .setDescription(
                    `تم تسجيل الدليل وإضافة الساعات مباشرة.\n\n` +

                    `Hours Added: ${formatHours(hours)}\n` +

                    `Points Added: ${result.points}\n\n` +

                    levelMessage
                  )
                  .addFields({
                    name: "Evidence",
                    value:
                      `[View Evidence](${evidence.url})`
                  })
                  .setTimestamp()
              ],

              ephemeral: true
            });
          }

          /* ---------------------------------------------
             DISCORD HOURS
             --------------------------------------------- */

          if (type === "discord") {

            if (
              !hours ||
              hours <= 0
            ) {

              return interaction.reply({
                content:
                  "اكتب عدد ساعات Discord.",
                ephemeral: true
              });
            }

            const result =
              addDiscordHours(
                interaction.user.id,
                hours,
                evidence.url,
                description
              );

            let levelMessage =
              `Discord Level: ${result.newLevel.level}`;

            if (
              result.newLevel.level >
              result.oldLevel.level
            ) {

              levelMessage +=
                `\nLevel Up: ${result.oldLevel.level} → ${result.newLevel.level}`;
            }

            return interaction.reply({
              embeds: [
                new EmbedBuilder()
                  .setColor(0x111111)
                  .setTitle(
                    "Discord Reputation Added"
                  )
                  .setDescription(
                    `تم تسجيل الدليل وإضافة الساعات مباشرة.\n\n` +

                    `Hours Added: ${formatHours(hours)}\n` +

                    `Points Added: ${result.points}\n\n` +

                    levelMessage
                  )
                  .addFields({
                    name: "Evidence",
                    value:
                      `[View Evidence](${evidence.url})`
                  })
                  .setTimestamp()
              ],

              ephemeral: true
            });
          }

          /* ---------------------------------------------
             ACHIEVEMENT
             --------------------------------------------- */

          if (
            type === "achievement"
          ) {

            const result =
              addAchievement(
                interaction.user.id,
                description,
                evidence.url
              );

            let levelMessage =
              `RP Level: ${result.newLevel.level}`;

            if (
              result.newLevel.level >
              result.oldLevel.level
            ) {

              levelMessage +=
                `\nLevel Up: ${result.oldLevel.level} → ${result.newLevel.level}`;
            }

            return interaction.reply({
              embeds: [
                new EmbedBuilder()
                  .setColor(0x111111)
                  .setTitle(
                    "Achievement Added"
                  )
                  .setDescription(
                    "تم تسجيل الإنجاز وإضافة النقطة مباشرة.\n\n" +
                    "Points Added: 1\n\n" +
                    levelMessage
                  )
                  .addFields({
                    name: "Evidence",
                    value:
                      `[View Evidence](${evidence.url})`
                  })
                  .setTimestamp()
              ],

              ephemeral: true
            });
          }
        }
      }

      /* ===================================================
         BUTTONS
         =================================================== */

      if (
        interaction.isButton()
      ) {

        /* -----------------------------------------------
           PROFILE
           ----------------------------------------------- */

        if (
          interaction.customId ===
          "profile"
        ) {

          return interaction.update({
            embeds: [
              createProfileEmbed(
                interaction.user
              )
            ],

            components:
              createMainButtons()
          });
        }

        /* -----------------------------------------------
           LEVEL LIST
           ----------------------------------------------- */

        if (
          interaction.customId ===
          "level_list"
        ) {

          return interaction.update({
            embeds: [
              createLevelsEmbed()
            ],

            components:
              createMainButtons()
          });
        }

        /* -----------------------------------------------
           REWARDS
           ----------------------------------------------- */

        if (
          interaction.customId ===
          "rewards"
        ) {

          return interaction.update({
            embeds: [
              createRewardsEmbed()
            ],

            components:
              createMainButtons()
          });
        }

        /* -----------------------------------------------
           RP HOURS
           ----------------------------------------------- */

        if (
          interaction.customId ===
          "rp_hours"
        ) {

          return interaction.reply({
            content:
              "لإضافة ساعات RP استخدم:\n\n" +
              "`/proof`\n\n" +
              "Type: RP Hours\n" +
              "Hours: عدد الساعات\n" +
              "Evidence: صورة أو فيديو\n" +
              "Description: شرح الدليل\n\n" +
              "بعد إرسال الدليل تتم الإضافة مباشرة.",
            ephemeral: true
          });
        }

        /* -----------------------------------------------
           DISCORD HOURS
           ----------------------------------------------- */

        if (
          interaction.customId ===
          "discord_hours"
        ) {

          return interaction.reply({
            content:
              "لإضافة ساعات Discord استخدم:\n\n" +
              "`/proof`\n\n" +
              "Type: Discord Hours\n" +
              "Hours: عدد الساعات\n" +
              "Evidence: صورة أو فيديو\n" +
              "Description: شرح الدليل\n\n" +
              "بعد إرسال الدليل تتم الإضافة مباشرة.",
            ephemeral: true
          });
        }

        /* -----------------------------------------------
           ACHIEVEMENT
           ----------------------------------------------- */

        if (
          interaction.customId ===
          "achievement"
        ) {

          return interaction.reply({
            content:
              "لإضافة إنجاز استخدم:\n\n" +
              "`/proof`\n\n" +
              "Type: Achievement\n" +
              "Evidence: صورة أو فيديو\n" +
              "Description: شرح الإنجاز\n\n" +
              "بعد إرسال الدليل تتم الإضافة مباشرة.",
            ephemeral: true
          });
        }
      }

    } catch (error) {

      console.error(
        "Interaction error:",
        error
      );

      try {

        if (
          interaction.replied ||
          interaction.deferred
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
          "Could not send error:",
          replyError
        );
      }
    }
  }
);

/* =========================================================
   WEB SERVER FOR RENDER
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
        "Reputation Level Bot is online."
      );
    }
  );

server.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      `Web server listening on port ${PORT}`
    );
  }
);

/* =========================================================
   LOGIN
   ========================================================= */

client.login(TOKEN)
  .then(() => {

    console.log(
      "Discord bot login successful."
    );

  })
  .catch(error => {

    console.error(
      "Discord login failed:",
      error
    );

    process.exit(1);
  });