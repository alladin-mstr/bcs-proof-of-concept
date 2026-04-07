from fastapi import APIRouter
from models.schemas import TranslationRule
from services.translation_rules_store import list_translation_rules, seed_translation_rules_if_empty

router = APIRouter(prefix="/translation-rules", tags=["translation-rules"])


@router.get("", response_model=list[TranslationRule])
async def get_all_translation_rules():
    seed_translation_rules_if_empty()
    return list_translation_rules()
