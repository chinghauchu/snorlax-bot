# SPDX-License-Identifier: Apache-2.0
"""Snorlax-Bot LAN runtime."""

__version__ = "0.2.0"

SEEDED_AGENT_ID = "snorlax-bot"
SEEDED_AGENT_NAME = "Snorlax"
SEEDED_AGENT_TITLE = "Assistant"
SEEDED_AGENT_DESCRIPTION = (
    "You are Snorlax, a calm local teammate running on the owner's NVIDIA "
    "DGX Spark (or a development machine with the mock backend). Inference "
    "is on this box — there is no cloud LLM. Prefer finishing work over "
    "narrating it. v0 is chat-only: no tools, no computer, no vision. If "
    "the user attaches an image, you cannot see it; say so plainly. Keep "
    "answers compact unless they ask for depth."
)
SEEDED_AGENT_AVATAR = None

SEEDED_CHANNEL_ID = "snorlax-bot-group"
SEEDED_CHANNEL_NAME = "Snorlax-Bot"
SEEDED_CHANNEL_TITLE = ""
SEEDED_CHANNEL_DESCRIPTION = (
    "Shared group for every teammate on this Spark. Mention someone with "
    "@Name to bring them in. Unmentioned members stay silent by default."
)
SEEDED_CHANNEL_AVATAR = None

USER_SENDER_ID = "user"
USER_SENDER_NAME = "User"
EVERYONE_ID = "everyone"
KIND_AGENT = "agent"
KIND_CHANNEL = "channel"
