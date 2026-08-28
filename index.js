const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  AttachmentBuilder,
  ChannelType,
  PermissionFlagsBits,
  Events
} = require("discord.js");

const fs = require("fs");
const http = require("http");

/* =========================================================
   ENV
   ========================================================= */

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const PORT = Number(process.env.PORT || 3000);

const ADMIN_ROLE_NAME = "Admin";

/* =========================================================
   BANNERS
   ========================================================= */

const ACTIVATION_BANNER_FILE = "./banner.PNG";
const TICKET_BANNER_FILE = "./ticket-banner.jpg.PNG";

/* =========================================================
   CHECK ENV
   ========================================================= */

if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
  throw new Error(
    "Missing DISCORD_TOKEN, CLIENT_ID, or GUILD_ID."
  );
}

/* =========================================================
   CLIENT
   ========================================================= */

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});

/* =========================================================
   BANNER FUNCTIONS
   ========================================================= */

function activationBannerAttachment() {
  if (!fs.existsSync(ACTIVATION_BANNER_FILE)) {
    console.error(
      `Activation banner not found: ${ACTIVATION_BANNER_FILE}`
    );

    return null;
  }

  return new AttachmentBuilder(
    ACTIVATION_BANNER_FILE,
    {
      name: "banner.PNG"
    }
  );
}

function ticketBannerAttachment() {
  if (!fs.existsSync(TICKET_BANNER_FILE)) {
    console.error(
      `Ticket banner not found: ${TICKET_BANNER_FILE}`
    );

    return null;
  }

  return new AttachmentBuilder(
    TICKET_BANNER_FILE,
    {
      name: "ticket-banner.jpg.PNG"
    }
  );
}

/* =========================================================
   ACTIVATION SYSTEM
   ========================================================= */

function activationEmbed() {
  return new EmbedBuilder()
    .setColor(0x111111)
    .setTitle("🔐 تفعيل الحساب")
    .setDescription(
      "اضغط على الزر الموجود بالأسفل لتفعيل حسابك.\n\n" +
      "بعد الضغط على زر التفعيل، قم بكتابة **PSN ID** الخاص بك."
    )
    .setImage("attachment://banner.PNG")
    .setFooter({
      text: "Rift Town • Activation System"
    });
}

function activationButton() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("activate_account")
      .setLabel("تفعيل الحساب")
      .setStyle(ButtonStyle.Success)
  );
}

/* =========================================================
   TICKET SYSTEM
   ========================================================= */

const TICKET_TYPES = {
  support: {
    name: "Support Ticket",
    description: "للمساعدة والاستفسارات",
    category: "Support Tickets"
  },

  report: {
    name: "Report Ticket",
    description: "للبلاغات والشكاوى",
    category: "Report Tickets"
  },

  management: {
    name: "Management Ticket",
    description: "للتواصل مع الإدارة",
    category: "Management Tickets"
  },

  owner: {
    name: "Owner Ticket",
    description: "للتواصل مع المالك",
    category: "Owner Tickets"
  }
};

/* =========================================================
   TICKET PANEL
   ========================================================= */

function ticketPanelEmbed() {
  return new EmbedBuilder()
    .setColor(0x111111)
    .setTitle("🎫 Rift Town • Ticket System")
    .setDescription(
      "اختر نوع التذكرة من القائمة بالأسفل لفتح تذكرة.\n\n" +
      "سيتم إنشاء التذكرة بشكل خاص بينك وبين المسؤولين."
    )
    .setImage("attachment://ticket-banner.jpg.PNG")
    .setFooter({
      text: "Rift Town • Ticket System"
    });
}

/* =========================================================
   TICKET SELECT MENU
   ========================================================= */

function ticketSelectRow() {
  const menu = new StringSelectMenuBuilder()
    .setCustomId("ticket_select")
    .setPlaceholder("اختر نوع التذكرة")
    .addOptions(
      Object.entries(TICKET_TYPES).map(
        ([value, ticket]) => ({
          label: ticket.name,
          description: ticket.description,
          value
        })
      )
    );

  return new ActionRowBuilder().addComponents(menu);
}

/* =========================================================
   CLOSE BUTTON
   ========================================================= */

function ticketCloseRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("ticket_close")
      .setLabel("Close Ticket")
      .setStyle(ButtonStyle.Danger)
  );
}

/* =========================================================
   SAFE CHANNEL NAME
   ========================================================= */

function safeChannelName(text) {
  return String(text || "user")
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 18) || "user";
}

/* =========================================================
   GET ADMIN ROLE
   ========================================================= */

function getAdminRole(guild) {
  return guild.roles.cache.find(
    role => role.name === ADMIN_ROLE_NAME
  ) || null;
}

/* =========================================================
   GET / CREATE CATEGORY
   ========================================================= */

async function getOrCreateTicketCategory(
  guild,
  categoryName
) {
  const existing = guild.channels.cache.find(
    channel =>
      channel.type === ChannelType.GuildCategory &&
      channel.name === categoryName
  );

  if (existing) {
    return existing;
  }

  return guild.channels.create({
    name: categoryName,
    type: ChannelType.GuildCategory,
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
    const ticket = TICKET_TYPES[type];

    if (!ticket) {
      return interaction.reply({
        content: "❌ نوع التذكرة غير صالح.",
        ephemeral: true
      });
    }

    const guild = interaction.guild;
    const user = interaction.user;

    /* -----------------------------------------------------
       CHECK EXISTING TICKET
       ----------------------------------------------------- */

    const existing = guild.channels.cache.find(
      channel =>
        channel.topic ===
        `rift-ticket:${user.id}:${type}`
    );

    if (existing) {
      return interaction.reply({
        content:
          `❌ لديك تذكرة مفتوحة بالفعل: ${existing}`,
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

    const adminRole = getAdminRole(guild);

    /* -----------------------------------------------------
       PERMISSIONS
       ----------------------------------------------------- */

    const permissionOverwrites = [
      {
        id: guild.roles.everyone.id,
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
       CREATE CHANNEL
       ----------------------------------------------------- */

    const channel =
      await guild.channels.create({
        name:
          `${type}-${safeChannelName(user.username)}`,

        type: ChannelType.GuildText,

        parent: category.id,

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
          `🎫 ${ticket.name}`
        )

        .setDescription(
          `مرحبًا ${user}!\n\n` +

          `تم إنشاء **${ticket.name}** بنجاح.\n` +

          `${ticket.description}.\n\n` +

          "اكتب تفاصيل طلبك هنا وسيتم الرد عليك من المسؤولين.\n\n" +

          "🔒 لإغلاق التذكرة اضغط على زر **Close Ticket**."
        )

        .setFooter({
          text:
            "Rift Town • Ticket System"
        })

        .setTimestamp();

    /* -----------------------------------------------------
       SEND TICKET MESSAGE
       ----------------------------------------------------- */

    await channel.send({
      content:
        `${user}` +
        (
          adminRole
            ? ` • <@&${adminRole.id}>`
            : ""
        ),

      embeds: [embed],

      components: [
        ticketCloseRow()
      ]
    });

    /* -----------------------------------------------------
       REPLY
       ----------------------------------------------------- */

    return interaction.reply({
      content:
        `✅ تم إنشاء التذكرة بنجاح: ${channel}`,
      ephemeral: true
    });

  } catch (error) {
    console.error(
      "Create ticket error:",
      error
    );

    if (!interaction.replied) {
      return interaction.reply({
        content:
          "❌ حدث خطأ أثناء إنشاء التذكرة.",
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
     /setup
     ------------------------------------------------------- */

  new SlashCommandBuilder()
    .setName("setup")
    .setDescription(
      "إرسال لوحة تفعيل الحساب"
    ),

  /* -------------------------------------------------------
     /tickets setup
     ------------------------------------------------------- */

  new SlashCommandBuilder()
    .setName("tickets")
    .setDescription(
      "نظام تذاكر Rift Town"
    )

    .addSubcommand(sub =>
      sub
        .setName("setup")
        .setDescription(
          "إرسال لوحة التكتات"
        )
    )

].map(command =>
  command.toJSON()
);

/* =========================================================
   REGISTER COMMANDS
   ========================================================= */

async function registerCommands() {
  const rest =
    new REST({
      version: "10"
    }).setToken(TOKEN);

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
}

/* =========================================================
   READY
   ========================================================= */

client.once(
  Events.ClientReady,
  async readyClient => {

    console.log(
      `Rift Town Bot online as ${readyClient.user.tag}`
    );

    try {
      await registerCommands();
    } catch (error) {
      console.error(
        "Slash command registration failed:",
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
         /setup
         لوحة التفعيل
         =================================================== */

      if (
        interaction.isChatInputCommand() &&
        interaction.commandName === "setup"
      ) {

        const attachment =
          activationBannerAttachment();

        if (!attachment) {
          return interaction.reply({
            content:
              "❌ لم يتم العثور على بنر التفعيل.\n" +
              "تأكد أن اسم الملف بالضبط: `banner.PNG`",
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

      /* ===================================================
         زر التفعيل
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
              "Rift Town - تفعيل الحساب"
            );

        const input =
          new TextInputBuilder()
            .setCustomId("psn")
            .setLabel("PSN ID")
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
            .addComponents(input)
        );

        return interaction.showModal(
          modal
        );
      }

      /* ===================================================
         إرسال التفعيل
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
            .getTextInputValue("psn")
            .trim();

        /* -------------------------------------------------
           VALIDATE PSN
           ------------------------------------------------- */

        if (
          !/^[A-Za-z0-9_.-]{2,32}$/.test(psn)
        ) {

          return interaction.editReply(
            "❌ PSN ID غير صالح.\n" +
            "استخدم الأحرف والأرقام و `_` أو `-` أو `.` فقط."
          );
        }

        /* -------------------------------------------------
           MEMBER
           ------------------------------------------------- */

        const member =
          await interaction.guild.members.fetch(
            interaction.user.id
          );

        /* -------------------------------------------------
           ACTIVATED ROLE
           ------------------------------------------------- */

        const roleName = "مفعل";

        let role =
          interaction.guild.roles.cache.find(
            r => r.name === roleName
          );

        if (!role) {

          role =
            await interaction.guild.roles.create({
              name: roleName,

              reason:
                "Rift Town activation"
            });
        }

        /* -------------------------------------------------
           CHECK BOT ROLE POSITION
           ------------------------------------------------- */

        const botMember =
          interaction.guild.members.me ||
          await interaction.guild.members.fetchMe();

        if (
          role.position >=
          botMember.roles.highest.position
        ) {

          return interaction.editReply(
            "❌ ارفع رتبة البوت فوق رتبة **مفعل** من إعدادات السيرفر."
          );
        }

        /* -------------------------------------------------
           ADD ROLE
           ------------------------------------------------- */

        await member.roles.add(
          role,
          "Rift Town account activation"
        );

        /* -------------------------------------------------
           CHANGE NICKNAME
           ------------------------------------------------- */

        try {

          await member.setNickname(
            psn,
            "Rift Town PSN activation"
          );

        } catch (error) {

          console.log(
            "Could not change nickname:",
            error.message
          );
        }

        /* -------------------------------------------------
           SUCCESS
           ------------------------------------------------- */

        return interaction.editReply(
          `✅ تم التفعيل بنجاح!\n\n` +
          `🎮 PSN ID: **${psn}**\n` +
          `🏷️ الرتبة: **${roleName}**`
        );
      }

      /* ===================================================
         /tickets setup
         =================================================== */

      if (
        interaction.isChatInputCommand() &&
        interaction.commandName === "tickets" &&
        interaction.options.getSubcommand() ===
          "setup"
      ) {

        const attachment =
          ticketBannerAttachment();

        if (!attachment) {

          return interaction.reply({
            content:
              "❌ لم يتم العثور على بنر التكت.\n" +
              "تأكد أن اسم الملف بالضبط:\n" +
              "`ticket-banner.jpg.PNG`",
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

      /* ===================================================
         اختيار نوع التكت
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
         إغلاق التكت
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
              "❌ لا يمكن إغلاق هذه القناة.",
            ephemeral: true
          });
        }

        /* -------------------------------------------------
           ADMIN ROLE
           ------------------------------------------------- */

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

        /* -------------------------------------------------
           TICKET OWNER
           ------------------------------------------------- */

        const topic =
          String(
            interaction.channel.topic || ""
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
            parts[1] || null;
        }

        /* -------------------------------------------------
           PERMISSION
           ------------------------------------------------- */

        if (
          !isAdmin &&
          String(interaction.user.id) !==
            String(ownerId)
        ) {

          return interaction.reply({
            content:
              "❌ ما عندك صلاحية لإغلاق هذه التذكرة.",
            ephemeral: true
          });
        }

        /* -------------------------------------------------
           CLOSE MESSAGE
           ------------------------------------------------- */

        await interaction.reply(
          "🔒 سيتم إغلاق التذكرة خلال 3 ثوانٍ..."
        );

        /* -------------------------------------------------
           DELETE CHANNEL
           ------------------------------------------------- */

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

    } catch (error) {

      console.error(
        "Interaction error:",
        error
      );

      try {

        if (
          interaction.deferred
        ) {

          await interaction.editReply({
            content:
              "❌ حدث خطأ. حاول مرة أخرى."
          });

        } else if (
          interaction.replied
        ) {

          await interaction.followUp({
            content:
              "❌ حدث خطأ. حاول مرة أخرى.",
            ephemeral: true
          });

        } else {

          await interaction.reply({
            content:
              "❌ حدث خطأ. حاول مرة أخرى.",
            ephemeral: true
          });

        }

      } catch (replyError) {

        console.error(
          "Could not send error reply:",
          replyError.message
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
        "Rift Town Bot is online"
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

client.login(TOKEN).catch(
  error => {

    console.error(
      "Discord login failed:",
      error
    );

    process.exit(1);
  }
);