import discord
from discord.ext import commands
import json
import os
from datetime import datetime, timezone

# --- CONFIGURATION ---
TOKEN_DISCORD="M**g"
CHANNEL_ID = 1544700845180981268
DOWNLOAD_FOLDER = "./images/drawings"
DATA_FOLDER = "./data"

CONTESTS_FILE = os.path.join(DATA_FOLDER, "contests.json")
DRAWINGS_FILE = os.path.join(DATA_FOLDER, "drawings.json")

# S'assurer que les dossiers existent
os.makedirs(DOWNLOAD_FOLDER, exist_ok=True)
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
    await ctx.send(f"🏆 Nouveau concours enregistré : **{title}** (Début : {now_iso[:10]})")

@bot.command(name="scan")
async def scan_channel(ctx=None):
    """Commande pour lancer la récupération des nouveaux dessins."""
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

                # Déterminer le concours actif à la date du message
                contest = get_contest_for_date(message.created_at, contests)
                
                ext = os.path.splitext(attachment.filename)[1]
                filename = f"{attachment_id}{ext}"
                file_path = os.path.join(DOWNLOAD_FOLDER, filename)

                # Sauvegarder le fichier sur le disque
                await attachment.save(file_path)

                # Ajouter la métadonnée
                drawings.append({
                    "id": attachment_id,
                    "filename": filename,
                    "local_path": f"./images/drawings/{filename}",
                    "author_display_name": message.author.display_name,
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