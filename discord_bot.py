import discord
from discord.ext import commands
import json
import os
from datetime import datetime, timezone
import aiohttp
from dotenv import load_dotenv
# --- CONFIGURATION ---
load_dotenv()

TOKEN_DISCORD = os.getenv("DISCORD_TOKEN")
CHANNEL_ID = int(os.getenv("DISCORD_CHANNEL_ID", 0))
if not TOKEN_DISCORD or not CHANNEL_ID:
    raise ValueError("❌ ERREUR : DISCORD_TOKEN ou DISCORD_CHANNEL_ID manquant dans le fichier .env !")
DOWNLOAD_FOLDER = "./images/drawings"
PFP_FOLDER = "./images/pfp"
DATA_FOLDER = "./data"

CONTESTS_FILE = os.path.join(DATA_FOLDER, "contests.json")
DRAWINGS_FILE = os.path.join(DATA_FOLDER, "drawings.json")

os.makedirs(DOWNLOAD_FOLDER, exist_ok=True)
os.makedirs(PFP_FOLDER, exist_ok=True)
os.makedirs(DATA_FOLDER, exist_ok=True)

intents = discord.Intents.default()
intents.message_content = True
bot = commands.Bot(command_prefix="!", intents=intents)

# --- FONCTIONS UTILITAIRES ---
def load_json(path):
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            try:
                return json.load(f)
            except json.JSONDecodeError:
                return []
    return []

def save_json(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def get_contest_for_date(message_date, contests):
    sorted_contests = sorted(contests, key=lambda x: datetime.fromisoformat(x["start_date"]))
    current_contest = None
    
    for contest in sorted_contests:
        contest_start = datetime.fromisoformat(contest["start_date"])
        if message_date >= contest_start:
            current_contest = contest
        else:
            break
            
    return current_contest


# --- VUE INTERACTIVE DISCORD POUR LE SONDAGE ---
class PollView(discord.ui.View):
    def __init__(self, contest_id, contest_title, drawings):
        super().__init__(timeout=None)
        self.contest_id = contest_id
        self.contest_title = contest_title
        self.drawings = drawings
        self.votes = {}

        options = []
        for idx, d in enumerate(self.drawings, start=1):
            label = f"N°{idx} - {d['author_display_name']}"
            options.append(discord.SelectOption(
                label=label[:100],
                value=d["id"],
                description=f"Vote pour le dessin N°{idx} de {d['author_display_name']}"[:100]
            ))

        if options:
            select = discord.ui.Select(
                placeholder="🗳️ Choisis ton dessin préféré...",
                min_values=1,
                max_values=1,
                options=options[:25]
            )
            select.callback = self.select_callback
            self.add_item(select)

    async def select_callback(self, interaction: discord.Interaction):
        selected_drawing_id = interaction.data["values"][0]
        user_id = interaction.user.id

        self.votes[user_id] = selected_drawing_id

        voted_drawing = next((d for d in self.drawings if d["id"] == selected_drawing_id), None)
        author_name = voted_drawing['author_display_name'] if voted_drawing else "l'artiste"

        await interaction.response.send_message(
            f"✅ Ton vote a été enregistré pour le dessin de **{author_name}** !", 
            ephemeral=True
        )

    @discord.ui.button(label="🏆 Clôturer le sondage (Admin)", style=discord.ButtonStyle.danger, custom_id="end_poll_btn")
    async def end_poll(self, interaction: discord.Interaction, button: discord.ui.Button):
        if not interaction.user.guild_permissions.administrator:
            await interaction.response.send_message("❌ Seul un administrateur peut clôturer le sondage !", ephemeral=True)
            return

        if not self.votes:
            await interaction.response.send_message("⚠️ Aucun vote n'a été enregistré !", ephemeral=True)
            return

        vote_counts = {}
        for drawing_id in self.votes.values():
            vote_counts[drawing_id] = vote_counts.get(drawing_id, 0) + 1

        max_votes = max(vote_counts.values())
        winner_ids = [d_id for d_id, count in vote_counts.items() if count == max_votes]

        contests = load_json(CONTESTS_FILE)
        updated = False
        winner_names = []

        for c in contests:
            if c["id"] == self.contest_id:
                c["winners"] = winner_ids
                c["end_date"] = datetime.now(timezone.utc).isoformat()
                updated = True
                break

        if updated:
            save_json(CONTESTS_FILE, contests)

        for w_id in winner_ids:
            d = next((item for item in self.drawings if item["id"] == w_id), None)
            if d:
                winner_names.append(d["author_display_name"])

        winners_str = ", ".join(f"**{name}**" for name in set(winner_names))

        for child in self.children:
            child.disabled = True
        await interaction.message.edit(view=self)

        result_msg = (
            f"🎉 **Le sondage pour le concours '{self.contest_title}' est terminé !** 🎉\n\n"
            f"🏆 **Vainqueur(s) ({max_votes} vote(s)) :** {winners_str}\n"
            f"📊 Nombre total de votants : {len(self.votes)}\n\n"
            f" Le site web a été automatiquement mis à jour avec le(s) gagnant(s) !"
        )
        await interaction.response.send_message(result_msg)


# --- FONCTION DE SCAN ---
async def run_scan(ctx=None):
    """Effectue le scan en ignorant strictement TOUS les messages envoyés par des bots."""
    if ctx:
        await ctx.send("🔍 Début de la récupération des dessins...")

    channel = bot.get_channel(CHANNEL_ID)
    if not channel:
        print("Salon introuvable !")
        return

    contests = load_json(CONTESTS_FILE)
    drawings = load_json(DRAWINGS_FILE)
    
    existing_ids = {d["id"] for d in drawings}
    new_count = 0

    async with aiohttp.ClientSession() as session:
        async for message in channel.history(limit=None, oldest_first=True):
            # IGNORER STRICTEMENT LES BOTS (empêche de scanner les images réenvoyées par le bot pour le sondage)
            if message.author.bot or message.author == bot.user:
                continue

            for attachment in message.attachments:
                if any(attachment.filename.lower().endswith(ext) for ext in ['.png', '.jpg', '.jpeg', '.webp']):
                    attachment_id = str(attachment.id)
                    
                    if attachment_id in existing_ids:
                        continue

                    ext = os.path.splitext(attachment.filename)[1]
                    filename = f"{attachment_id}{ext}"
                    file_path = os.path.join(DOWNLOAD_FOLDER, filename)
                    await attachment.save(file_path)

                    author_id = str(message.author.id)
                    pfp_filename = f"{author_id}.png"
                    pfp_path = os.path.join(PFP_FOLDER, pfp_filename)

                    if not os.path.exists(pfp_path):
                        pfp_url = message.author.display_avatar.url
                        async with session.get(str(pfp_url)) as resp:
                            if resp.status == 200:
                                pfp_data = await resp.read()
                                with open(pfp_path, "wb") as f:
                                    f.write(pfp_data)

                    contest = get_contest_for_date(message.created_at, contests)

                    drawings.append({
                        "id": attachment_id,
                        "filename": filename,
                        "local_path": f"./images/drawings/{filename}",
                        "author_display_name": message.author.display_name,
                        "pfp": f"./images/pfp/{pfp_filename}",
                        "created_at": message.created_at.isoformat(),
                        "contest_id": contest["id"] if contest else "hors_concours",
                        "contest_title": contest["title"] if contest else "Hors Concours"
                    })
                    
                    existing_ids.add(attachment_id)
                    new_count += 1

    save_json(DRAWINGS_FILE, drawings)
    
    msg = f"✅ Scan terminé ! {new_count} nouveau(x) dessin(s) ajouté(s)."
    print(msg)
    if ctx:
        await ctx.send(msg)


# --- COMMANDES DISCORD ---

@bot.command(name="nouveau_concours")
@commands.has_permissions(administrator=True)
async def new_contest(ctx, *, title: str):
    contests = load_json(CONTESTS_FILE)
    now_iso = datetime.now(timezone.utc).isoformat()
    new_id = f"concours_{len(contests) + 1}"
    
    contests.append({
        "id": new_id,
        "title": title,
        "start_date": now_iso,
        "winners": []
    })
    
    save_json(CONTESTS_FILE, contests)

    target_channel = bot.get_channel(CHANNEL_ID)
    announcement = (
        f"@everyone \n un nouveau concours est lancé !!! \n"
        f"le thème du concours est **{title}** alors balancez vos plus belles créations sur le sujet pour essayer de gagner !!! \n"
        f"(Début : {now_iso[:10]})"
    )

    if target_channel:
        await target_channel.send(announcement)
        if ctx.channel.id != CHANNEL_ID:
            await ctx.send(f"✅ Concours **{title}** créé et annonce envoyée dans <#{CHANNEL_ID}> !")
    else:
        await ctx.send("⚠️ Impossible de trouver le salon des dessins.")


@bot.command(name="scan")
async def scan_command(ctx):
    await run_scan(ctx)


@bot.command(name="sondage")
@commands.has_permissions(administrator=True)
async def create_poll(ctx):
    """Lance le sondage et envoie chaque image dans un message individuel dans CHANNEL_ID."""
    target_channel = bot.get_channel(CHANNEL_ID)
    if not target_channel:
        await ctx.send("⚠️ Impossible de trouver le salon cible pour poster le sondage (`CHANNEL_ID`).")
        return

    await ctx.send("🔄 Scan automatique des derniers dessins avant de lancer le sondage...")
    await run_scan(ctx=None)

    contests = load_json(CONTESTS_FILE)
    drawings = load_json(DRAWINGS_FILE)

    if not contests:
        await ctx.send("⚠️ Aucun concours n'est enregistré !")
        return

    contests.sort(key=lambda x: datetime.fromisoformat(x["start_date"]), reverse=True)
    current_contest = contests[0]

    contest_drawings = [d for d in drawings if d.get("contest_id") == current_contest["id"]]

    if not contest_drawings:
        await ctx.send(f"⚠️ Aucun dessin trouvé pour le concours **{current_contest['title']}** !")
        return

    # Prévenir le salon où la commande a été tapée
    if ctx.channel.id != CHANNEL_ID:
        await ctx.send(f"✅ Sondage en cours d'envoi dans <#{CHANNEL_ID}>...")

    # Annonce de début de sondage dans le salon des dessins
    await target_channel.send(
        f"🗳️ **SONDAGE : {current_contest['title']}** ({len(contest_drawings)} participation(s))\n"
        f"Voici les dessins en compétition :"
    )

    # 1 MESSAGE SEPARÉ PAR DESSIN
    for idx, d in enumerate(contest_drawings, start=1):
        file_path = os.path.join(DOWNLOAD_FOLDER, d["filename"])
        if os.path.exists(file_path):
            file_to_send = discord.File(file_path, filename=d["filename"])
            content = f"🖼️ **N°{idx}** — Dessin par **{d['author_display_name']}**"
            await target_channel.send(content=content, file=file_to_send)

    # PAVÉ DE VOTE DANS CHANNEL_ID
    poll_view = PollView(current_contest["id"], current_contest["title"], contest_drawings)
    await target_channel.send(
        f"👇 **Vote ci-dessous pour ton dessin préféré du concours : {current_contest['title']} !**\n*(Chaque membre a droit à 1 seul vote)*",
        view=poll_view
    )


@bot.event
async def on_ready():
    print(f"Bot connecté en tant que {bot.user}")

bot.run(TOKEN_DISCORD)