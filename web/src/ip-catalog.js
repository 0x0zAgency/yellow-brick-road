/** Category taxonomy: names describe creator-submitted work, not legal determinations. */
export const IP_CATEGORIES=[
  {
    "id": "sound-recording",
    "group": "Music & audio",
    "label": "Sound recording / master",
    "objectType": "sound-recording",
    "primary": "Master recording",
    "examples": "WAV, FLAC, AIFF, MP3",
    "musical": true
  },
  {
    "id": "musical-work",
    "group": "Music & audio",
    "label": "Composition / songwriting",
    "objectType": "musical-work",
    "primary": "Score, sheet music, MIDI, or demo",
    "examples": "PDF, MIDI, MusicXML",
    "writers": true
  },
  {
    "id": "song-lyrics",
    "group": "Music & audio",
    "label": "Song lyrics",
    "objectType": "literary-work",
    "primary": "Lyrics manuscript",
    "examples": "TXT, DOCX, PDF",
    "writers": true
  },
  {
    "id": "sound-design",
    "group": "Music & audio",
    "label": "Sound design / effects",
    "objectType": "sound-recording",
    "primary": "Original sound asset",
    "examples": "WAV, FLAC, project file"
  },
  {
    "id": "musical-performance",
    "group": "Music & audio",
    "label": "Recorded musical performance",
    "objectType": "performance-recording",
    "primary": "Performance capture",
    "examples": "MOV, MP4, WAV"
  },
  {
    "id": "literary-work",
    "group": "Writing & publishing",
    "label": "Literary writing / manuscript",
    "objectType": "literary-work",
    "primary": "Manuscript",
    "examples": "TXT, PDF, EPUB, DOCX"
  },
  {
    "id": "poetry",
    "group": "Writing & publishing",
    "label": "Poetry / spoken word",
    "objectType": "literary-work",
    "primary": "Writing or recording",
    "examples": "TXT, PDF, WAV"
  },
  {
    "id": "screenplay",
    "group": "Writing & publishing",
    "label": "Screenplay / script",
    "objectType": "dramatic-work",
    "primary": "Original script",
    "examples": "PDF, FDX"
  },
  {
    "id": "journalism",
    "group": "Writing & publishing",
    "label": "Editorial / journalism",
    "objectType": "literary-work",
    "primary": "Original article",
    "examples": "HTML, PDF, TXT"
  },
  {
    "id": "educational-material",
    "group": "Writing & publishing",
    "label": "Course / educational work",
    "objectType": "educational-work",
    "primary": "Course materials",
    "examples": "Slides, PDF, video"
  },
  {
    "id": "photograph",
    "group": "Images & visual",
    "label": "Photography",
    "objectType": "photographic-work",
    "primary": "Original photograph",
    "examples": "RAW, DNG, JPG, TIFF"
  },
  {
    "id": "illustration",
    "group": "Images & visual",
    "label": "Illustration / graphic art",
    "objectType": "visual-artwork",
    "primary": "Artwork or illustration",
    "examples": "SVG, PSD, PNG, AI"
  },
  {
    "id": "painting",
    "group": "Images & visual",
    "label": "Painting / physical artwork",
    "objectType": "visual-artwork",
    "primary": "Evidence and artwork file",
    "examples": "TIFF, scans, photographs"
  },
  {
    "id": "digital-art",
    "group": "Images & visual",
    "label": "Digital art / animation",
    "objectType": "visual-artwork",
    "primary": "Original digital artwork",
    "examples": "BLEND, PNG, GIF, video"
  },
  {
    "id": "moving-image",
    "group": "Film & media",
    "label": "Film / video",
    "objectType": "audiovisual-work",
    "primary": "Original video",
    "examples": "MOV, MP4, MXF"
  },
  {
    "id": "video-edit",
    "group": "Film & media",
    "label": "Edited video / motion graphics",
    "objectType": "audiovisual-work",
    "primary": "Finished edit",
    "examples": "MP4, AEP, PRPROJ"
  },
  {
    "id": "performance-video",
    "group": "Film & media",
    "label": "Recorded performance",
    "objectType": "performance-recording",
    "primary": "Performance capture",
    "examples": "Multi-camera video"
  },
  {
    "id": "choreography",
    "group": "Movement & spatial",
    "label": "Choreographic work / dance sequence",
    "objectType": "choreographic-work",
    "primary": "Video or spatial choreography",
    "examples": "MP4, MV-HEVC, BVH, FBX",
    "spatial": true
  },
  {
    "id": "dance-move",
    "group": "Movement & spatial",
    "label": "Dance move / movement motif evidence",
    "objectType": "movement-evidence",
    "primary": "Recorded move or spatial video",
    "examples": "MP4, BVH, FBX, USD",
    "spatial": true,
    "notice": "Individual moves are not automatically protected by copyright. This registration preserves evidence; it does not determine exclusive rights."
  },
  {
    "id": "gesture",
    "group": "Movement & spatial",
    "label": "Gesture / bodily expression capture",
    "objectType": "movement-evidence",
    "primary": "Gesture capture",
    "examples": "Spatial video, tracked poses",
    "spatial": true
  },
  {
    "id": "motion-capture",
    "group": "Movement & spatial",
    "label": "Motion capture / 3D animation",
    "objectType": "motion-capture-data",
    "primary": "3D motion data",
    "examples": "BVH, FBX, USD, C3D",
    "spatial": true
  },
  {
    "id": "theatrical-performance",
    "group": "Movement & spatial",
    "label": "Theatrical / stage performance",
    "objectType": "dramatic-work",
    "primary": "Performance fixation",
    "examples": "Multi-camera video, script"
  },
  {
    "id": "three-d-model",
    "group": "3D & physical design",
    "label": "3D sculpture / model",
    "objectType": "three-dimensional-artwork",
    "primary": "3D source model",
    "examples": "OBJ, STL, GLB, USDZ"
  },
  {
    "id": "industrial-design",
    "group": "3D & physical design",
    "label": "Product / industrial design",
    "objectType": "design-documentation",
    "primary": "Design documentation",
    "examples": "CAD, STEP, drawings"
  },
  {
    "id": "architecture",
    "group": "3D & physical design",
    "label": "Architectural design",
    "objectType": "architectural-work",
    "primary": "Plans and model",
    "examples": "IFC, CAD, PDF"
  },
  {
    "id": "fashion-design",
    "group": "3D & physical design",
    "label": "Fashion / textile design",
    "objectType": "design-documentation",
    "primary": "Pattern or documentation",
    "examples": "DXF, sketches, OBJ"
  },
  {
    "id": "software-code",
    "group": "Software & interactive",
    "label": "Software source code",
    "objectType": "computer-program",
    "primary": "Source archive or manifest",
    "examples": "Source archive, Git snapshot"
  },
  {
    "id": "game-content",
    "group": "Software & interactive",
    "label": "Video game / game asset",
    "objectType": "interactive-work",
    "primary": "Source asset",
    "examples": "Unity, Unreal, GLB"
  },
  {
    "id": "interface-design",
    "group": "Software & interactive",
    "label": "Interface / interaction design",
    "objectType": "design-documentation",
    "primary": "Design source",
    "examples": "Figma export, SVG, code"
  },
  {
    "id": "virtual-world",
    "group": "Software & interactive",
    "label": "Virtual space / immersive work",
    "objectType": "interactive-work",
    "primary": "Scene or world",
    "examples": "GLTF, USD, project archive"
  },
  {
    "id": "research-dataset",
    "group": "Data & knowledge",
    "label": "Research dataset",
    "objectType": "dataset",
    "primary": "Dataset / source archive",
    "examples": "CSV, Parquet, JSON"
  },
  {
    "id": "research-work",
    "group": "Data & knowledge",
    "label": "Research paper / technical work",
    "objectType": "scholarly-work",
    "primary": "Paper or publication",
    "examples": "PDF, TeX"
  },
  {
    "id": "database",
    "group": "Data & knowledge",
    "label": "Database / compilation",
    "objectType": "database",
    "primary": "Database schema and archive",
    "examples": "SQL, CSV, SQLite"
  },
  {
    "id": "brand-identity",
    "group": "Brands & identity",
    "label": "Brand / logo / trademark evidence",
    "objectType": "brand-evidence",
    "primary": "Brand documentation",
    "examples": "SVG, AI, product specimens",
    "notice": "Trademark protection depends on applicable law and use, not registration on the Road."
  },
  {
    "id": "other",
    "group": "Other",
    "label": "Other original work / evidence",
    "objectType": "creative-work",
    "primary": "Primary evidence file",
    "examples": "Any file type"
  }
];
export const SPATIAL_FIELDS=[
  {
    "id": "claimedCaptureAt",
    "label": "Claimed capture date/time (ISO 8601)",
    "placeholder": "2026-10-16T12:00:00-05:00"
  },
  {
    "id": "claimedFirstPerformedAt",
    "label": "Claimed first performance (ISO 8601)",
    "placeholder": "2026-10-01T20:00:00-05:00"
  },
  {
    "id": "captureSystem",
    "label": "Capture device / tracking system",
    "placeholder": "Spatial camera, optical mocap, inertial tracking"
  },
  {
    "id": "captureFormat",
    "label": "Spatial video / motion file format",
    "placeholder": "MV-HEVC, USD, BVH, FBX, C3D"
  },
  {
    "id": "frameRate",
    "label": "Capture frame rate (fps)",
    "placeholder": "60"
  },
  {
    "id": "coordinateReference",
    "label": "Coordinates and reference frame",
    "placeholder": "Right-handed, Y-up, meters"
  },
  {
    "id": "skeletonConvention",
    "label": "Pose / skeleton convention",
    "placeholder": "SMPL, COCO-17, OpenPose or custom"
  },
  {
    "id": "performerCredit",
    "label": "Performers / creators (claimed)",
    "placeholder": "Credited names or pseudonyms"
  },
  {
    "id": "captureWitness",
    "label": "Witness / independent reference",
    "placeholder": "Externally signed witness reference"
  },
  {
    "id": "attestationUri",
    "label": "Existing C2PA / PROV-O / timestamp evidence URI",
    "placeholder": "https://... or ipfs://..."
  }
];
export function getIpCategory(id){return IP_CATEGORIES.find(c=>c.id===id)||IP_CATEGORIES[0];}
export function groupedIpCategories(){const groups={};for(const category of IP_CATEGORIES)(groups[category.group]||=[]).push(category);return Object.entries(groups);}
export function spatialEvidence(claims={},registeredAt){
 const result={evidenceType:'creator-declared-spatial-fixation',claimsNotVerified:true,declaredAt:registeredAt,
  provenanceStandards:{c2pa:'reference-to-external-attestation-only',provO:'compatible-evidence-links-planned'}};
 for(const f of SPATIAL_FIELDS)if(typeof claims[f.id]==='string'&&claims[f.id].trim())result[f.id]=claims[f.id].trim().slice(0,512);
 return result;
}
