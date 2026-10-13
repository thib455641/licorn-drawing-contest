import discord
from discord.ext import commands
import json
import os
from datetime import datetime, timezone
import aiohttp

# --- CONFIGURATION ---
TOKEN_DISCORD = "M***8"
CHANNEL_ID = 1544700845180981268
DOWNLOAD_FOLDER = "./images/drawings"
PFP_FOLDER = "./images/pfp"
DATA_FOLDER = "./data"

CONTESTS_FILE = os.path.join(DATA_FOLDER, "contests.json")
DRAWINGS_FILE = os.path.join(DATA_FOLDER, "drawings.json")

# S'assurer que tous les dossiers existent
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
    """
    Associe un dessin au bon concours en fonction de sa date de publication.
    """
    sorted_contests = sorted(contests, key=lambda x: datetime.fromisoformat(x["start_date"]))
    current_contest = None
    
    for contest in sorted_contests:
        contest_start = datetime.fromisoformat(contest["start_date"])
        if message_date >= contest_start:
            current_contest = contest
        else:
            break
            
    return current_contest

# --- COMMANDES ---

@bot.command(name="nouveau_concours")
@commands.has_permissions(administrator=True)
async def new_contest(ctx, *, title: str):
    """Commande modérateur pour déclarer un nouveau concours."""

    contests = load_json(CONTESTS_FILE)
    
    now_iso = datetime.now(timezone.utc).isoformat()
    new_id = f"concours_{len(contests) + 1}"
    
    contests.append({
        "id": new_id,
        "title": title,
        "start_date": now_iso
    })
    
    save_json(CONTESTS_FILE, contests)

    # 1. Récupérer le salon dédié aux dessins
    target_channel = bot.get_channel(CHANNEL_ID)
    
    # Message d'annonce à publier
    announcement = (""
        f"@everyone \n un nouveau concours est lancé !!! \n"
        f"le thème du concours est **{title}** alors balancez vos plus belles créations sur le sujet pour essayer de gagner !!! \n"
        f"(Début : {now_iso[:10]})"
    )

    if target_channel:
        # Envoie l'annonce dans le salon des dessins
        await target_channel.send(announcement)
        
        # (Optionnel) Si la commande n'a pas été tapée dans le salon des dessins, on prévient le modérateur
        if ctx.channel.id != CHANNEL_ID:
            await ctx.send(f"✅ Concours **{title}** créé et annonce envoyée dans <#{CHANNEL_ID}> !")
    else:
        await ctx.send("⚠️ Impossible de trouver le salon des dessins. Vérifie l'ID `CHANNEL_ID`.")

@bot.command(name="scan")
async def scan_channel(ctx=None):
    """Commande pour lancer la récupération des nouveaux dessins et des photos de profil."""
    if ctx:
        await ctx.send("🔍 Début de la récupération des dessins...")

    channel = bot.get_channel(CHANNEL_ID)
    if not channel:
        print("Salon introuvable !")
        return

    contests = load_json(CONTESTS_FILE)
    drawings = load_json(DRAWINGS_FILE)
    
    # Récupérer les ID déjà enregistrés pour éviter de retélécharger
    existing_ids = {d["id"] for d in drawings}
    new_count = 0

    # Session HTTP pour récupérer l'image de profil
    async with aiohttp.ClientSession() as session:
        # Parcourir les messages du salon (du plus ancien au plus récent)
        async for message in channel.history(limit=None, oldest_first=True):
            if message.author.bot:
                continue

            for attachment in message.attachments:
                # Filtrer les images
                if any(attachment.filename.lower().endswith(ext) for ext in ['.png', '.jpg', '.jpeg', '.webp']):
                    attachment_id = str(attachment.id)
                    
                    # Passer si l'image est déjà enregistrée
                    if attachment_id in existing_ids:
                        continue

                    # 1. Sauvegarder l'image du dessin
                    ext = os.path.splitext(attachment.filename)[1]
                    filename = f"{attachment_id}{ext}"
                    file_path = os.path.join(DOWNLOAD_FOLDER, filename)
                    await attachment.save(file_path)

                    # 2. Sauvegarder la PFP de l'artiste
                    author_id = str(message.author.id)
                    pfp_filename = f"{author_id}.png"
                    pfp_path = os.path.join(PFP_FOLDER, pfp_filename)

                    # Télécharger l'avatar seulement s'il n'est pas encore enregistré localement
                    if not os.path.exists(pfp_path):
                        pfp_url = message.author.display_avatar.url
                        async with session.get(str(pfp_url)) as resp:
                            if resp.status == 200:
                                pfp_data = await resp.read()
                                with open(pfp_path, "wb") as f:
                                    f.write(pfp_data)

                    # 3. Déterminer le concours actif à la date du message
                    contest = get_contest_for_date(message.created_at, contests)

                    # 4. Ajouter les données dans le tableau
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

    # Sauvegarder le fichier JSON final
    save_json(DRAWINGS_FILE, drawings)
    
    msg = f"✅ Scan terminé ! {new_count} nouveau(x) dessin(s) ajouté(s)."
    print(msg)
    if ctx:
        await ctx.send(msg)

@bot.event
async def on_ready():
    print(f"Bot connecté en tant que {bot.user}")

# Lancer le bot avec ton Token
bot.run(TOKEN_DISCORD)