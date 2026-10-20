// "Room dress": every room (oda) of an office (ofis) has its own identity inside the floor's (kat) theme. A dress picks the
// room's floor material, wall colour, what hangs on its back wall and what stands in its corners. See the
// floor-interior-design skill (kat → ofis → oda).

export interface DressPiece { frame: string; at: 'bl' | 'bm' | 'br' | 'abs'; /** abs: pixel position inside the map */ dx?: number; dy?: number }
export interface Dress {
  /** FLOORS / mat:* key; undefined keeps the layout's floor */
  floor?: string;
  /** index into WALL_FACE_ROWS */
  wall: number;
  /** hung on the back wall, spread evenly */
  back: string[];
  /** x positions (px) of the back items in a one-room office, where the wall is shared with the window and the door */
  openBack?: number[];
  /** stood in the bottom corners / middle */
  corners: DressPiece[];
}

export const DRESSES: Record<string, Dress> = {
  // Emrecan CV: the application pipeline, one story per room
  coordination: { floor: 'mat:warmwood', wall: 3, back: ['poster_sun', 'vision_board'], corners: [{ frame: 'lz_plant_a', at: 'br' }] },
  radar: { floor: 'tileTeal', wall: 6, back: ['radar_screen', 'map_pins', 'job_board'], corners: [{ frame: 'filecab', at: 'bl', dx: 10 }, { frame: 'lz_plant_b', at: 'br' }] },
  tailor: { floor: 'tileYellow', wall: 4, back: ['cv_drafts', 'tape_measure', 'poster_leaf'], corners: [{ frame: 'mannequin', at: 'bl', dx: 10 }, { frame: 'fabric_rolls', at: 'br' }] },
  letters: { floor: 'mat:lilac', wall: 1, back: ['quote_wall', 'poster_leaf'], corners: [{ frame: 'typewriter_desk', at: 'bl', dx: 16 }, { frame: 'floor_lamp', at: 'br' }, { frame: 'letter_stack', at: 'bm' }] },
  delivery: { floor: 'mat:blue', wall: 5, back: ['checklist_board', 'mailbox_wall', 'clock'], corners: [{ frame: 'stamp_desk', at: 'bl', dx: 14 }, { frame: 'parcel_shelf', at: 'br' }] },
  archive: { floor: 'mat:sage', wall: 7, back: ['lz_shelf_books_a', 'diploma', 'lz_shelf_books_b'], corners: [{ frame: 'archive_cabinets', at: 'bl', dx: 20 }, { frame: 'scanner', at: 'br' }] },
  // cv-checker: a review laboratory
  checker: { floor: 'mat:blue', wall: 2, back: ['resume_wall', 'score_board', 'checklist_board'], openBack: [160, 196, 230], corners: [{ frame: 'scanner', at: 'bl', dx: 40 }, { frame: 'magnifier_stand', at: 'br', dx: -4 }, { frame: 'scanner', at: 'abs', dx: 184, dy: 150 }, { frame: 'magnifier_stand', at: 'abs', dx: 160, dy: 164 }, { frame: 'letter_stack', at: 'abs', dx: 206, dy: 156 }] },
  // interview-assistant: a rehearsal room
  interview: { floor: 'mat:sand', wall: 3, back: ['cue_cards', 'timer_clock', 'poster_sun'], openBack: [160, 196, 232], corners: [{ frame: 'mic_stand', at: 'bl', dx: 40 }, { frame: 'ring_light', at: 'br', dx: -4 }, { frame: 'interview_table', at: 'abs', dx: 186, dy: 168 }] },
  // portfolio: a web studio
  portfolio: { floor: 'mat:lilac', wall: 1, back: ['site_mockup', 'swatch_board', 'sticky_wall'], openBack: [160, 196, 232], corners: [{ frame: 'sketch_desk', at: 'abs', dx: 186, dy: 168 }, { frame: 'lz_plant_a', at: 'bl', dx: 40 }] },
};

export const dressOf = (key: string): Dress | undefined => DRESSES[key];
