"""Data models for personal project tracking and living commit timeline."""

from dataclasses import dataclass, field, asdict
from typing import List, Optional, Dict, Any
import time
import re
import uuid


def generate_id() -> str:
    return str(uuid.uuid4())[:8]


def slugify(text: str) -> str:
    s = text.lower().strip()
    s = re.sub(r'[^a-z0-9]+', '-', s)
    return s.strip('-') or 'project'


@dataclass
class MediaAttachment:
    id: str = field(default_factory=generate_id)
    project_id: str = ""
    entry_id: Optional[str] = None
    filename: str = ""
    stored_path: str = ""
    url: str = ""
    mime_type: str = "image/jpeg"
    size_bytes: int = 0
    created_at: int = field(default_factory=lambda: int(time.time() * 1000))

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class TimelineEntry:
    id: str = field(default_factory=generate_id)
    project_id: str = ""
    session_id: Optional[str] = None
    type: str = "progress"  # 'progress', 'blocker', 'change', 'decision'
    title: str = ""
    body: str = ""
    resolved: bool = False
    resolution_notes: str = ""
    media: List[Dict[str, Any]] = field(default_factory=list)
    timestamp: int = field(default_factory=lambda: int(time.time() * 1000))
    deleted: bool = False
    created_at: int = field(default_factory=lambda: int(time.time() * 1000))
    updated_at: int = field(default_factory=lambda: int(time.time() * 1000))

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class WorkSession:
    id: str = field(default_factory=generate_id)
    project_id: str = ""
    start_time: int = field(default_factory=lambda: int(time.time() * 1000))
    end_time: int = field(default_factory=lambda: int(time.time() * 1000))
    duration_minutes: int = 25
    summary: str = ""
    created_at: int = field(default_factory=lambda: int(time.time() * 1000))

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class Project:
    id: str = ""
    name: str = ""
    description: str = ""
    category: str = "hardware"  # 'hardware', 'software', 'mechatronics', 'research', 'creative', 'other'
    start_date: str = ""
    status: str = "active"  # 'active', 'paused', 'completed', 'archived'
    tags: List[str] = field(default_factory=list)
    cover_image: Optional[str] = None
    notes: str = ""  # Free-form markdown requirements, specs, BOM
    deleted: bool = False
    created_at: int = field(default_factory=lambda: int(time.time() * 1000))
    updated_at: int = field(default_factory=lambda: int(time.time() * 1000))

    def __post_init__(self):
        if not self.id and self.name:
            self.id = slugify(self.name)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

