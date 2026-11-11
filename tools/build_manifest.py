import json, math
FPS=30
a=json.load(open('analysis/acoustic.json'))
N=a['total_frames']; L=a['lines']
def ls(i): return L[i]['start_s']
# (time_s, camera_mode, fov, tilt, sprite_state, special_events)
plan=[
 (0.00,'MAP',35,0,'idle_trolley','surveyed_section_only_not_whole_store; trolley_wheel_shadow_points_wrong_aisle; lights_on_with_kicks'),
 (6.00,'SCAN',50,-10,'idle_trolley','camera_descends_corridors'),
 (ls(0),'LOCK',55,0,'idle_trolley','lock_on_wolfgang; objective=BUY 1 SHELF held_clean_before_hud_fills'),
 (ls(2),'FPV',70,-55,'walk','look_down_yellow_arrow'),
 (ls(3),'FPV',70,0,'walk','glance_left_right_products'),
 (22.28,'CHASE',60,0,'push_trolley','groove_walk; wheel_squeak_on_snare'),
 (30.30,'MAP',35,0,'push_trolley','MAP_CHECKIN_1_tidy_reassuring_route; distance_to_exit=412m'),
 (ls(4),'CHASE',62,0,'push_trolley','verse1_fast_rap; clock_945_in_every_room'),
 (ls(5),'CHASE',62,0,'push_trolley','picks_DAEDALUS_shelf_flatpack_box_into_trolley_continuity'),
 (ls(6),'FPV',72,0,'turn_left','junction_left_bedroom'),
 (ls(7),'FPV',72,0,'turn_right','junction_right_SAME_bedroom_identical_composition_one_element_changed'),
 (ls(8),'FPV',72,0,'look_left','family_portrait_same_faces'),
 (ls(10),'FPV',70,-55,'walk','look_down_yellow_arrow_keep_to_route'),
 (ls(11),'CHASE',62,0,'push_trolley','curtain_contradiction_own_trolley_vanishes_through_far_curtain_ahead_of_him'),
 (ls(12),'FPV',70,-60,'walk','step_over_paint_line'),
 (ls(13),'FPV',70,35,'idle','look_up_ceiling_click'),
 (ls(14),'CHASE',58,0,'idle','physical_badge_changes_first_then_hud_updates_reluctantly=PERMANENT ASSISTANT TO THE SHELVING'),
 (ls(15),'CHASE',50,0,'look_down','thread_found_on_cuff; inventory+=thread'),
 (ls(16),'CHASE',55,0,'tie_thread','thread_tied_to_single_bed_ARIADNE_throw_anchor_bed_stays_put; thread_tension'),
 (ls(17),'CHASE',60,0,'push_trolley','thread_unspools'),
 (ls(19),'MAP',35,0,'push_trolley','SEAMLESS_ROOM_TO_MAP_RISE_1; MAP_CHECKIN_2_rooms_move_you_are_here_dot_fixed; different_four_poster_takes_flight'),
 (ls(21),'SCROLL',45,0,'walk','prechorus_side_scroll_roomsets_ready_tables_laid'),
 (ls(25),'FPV',70,-60,'walk','arrow_under_shoe'),
 (ls(27),'SCROLL',48,0,'walk','build_rising; corridor_stretches'),
 (66.40,'CHASE_FAST',70,0,'run','trolley_wheel_catches_arrow; arrow_lifts_like_vinyl_circuit_underside_races_down_corridor'),
 (ls(29),'CHASE_FAST',78,0,'run','CHORUS_SNAP_176; showroom_unfolds_bedroom_kitchen_office_bedroom_loop; wolfgang_and_trolley_stay_solid; objective=ESCAPE'),
 (ls(34),'FPV',80,0,'turn_left','round_another_corner'),
 (ls(35),'FPV',80,0,'run','past_another_door'),
 (ls(36),'CHASE_FAST',78,0,'run','chorus_continue'),
 (ls(41),'CHASE',60,0,'slowmo','let_me_go_wolfgang_slow_store_slides_past_full_speed'),
 (88.95,'MAP',35,0,'push_trolley','MAP_CHECKIN_3_MINO_blip_passes_through_wall_with_no_doorway'),
 (95.40,'TOP_TIGHT',40,0,'push_trolley','pre_reveal_polished_strip_erases_footprints_and_a_dropped_receipt'),
 (ls(42),'CHASE_LOW',50,8,'freeze','MINO7000_reveal_3_parts_horn_silhouette_then_brushes_then_model_name'),
 (ls(43),'CLOSE',40,0,'freeze','red_sensor_hot_breath_steam'),
 (ls(44),'CHASE_LOW',50,0,'step_back','mino_squares_up_sideways'),
 (ls(46),'TOP_TIGHT',40,0,'freeze','polish_warning_circle_round_feet; brushes_catch_loose_thread_end'),
 (ls(47),'FPV',70,0,'look_left','KNOSSOS_kitchen_7_stone_loaf'),
 (ls(48),'FPV',70,0,'look_right','phone_no_dialling_tone'),
 (ls(49),'FPV',70,-20,'look_down','drawers_loose_string_key'),
 (ls(51),'FPV',55,-15,'look_down','price_tags_flicker_16ths_then_hold_readable_on_measurements_tag'),
 (ls(57),'CHASE',55,0,'walk','MINOS_wardrobe_doors_explain'),
 (ls(58),'SCROLL',45,0,'walk','break1_inventory_adds_per_line'),
 (ls(66),'MAP',35,0,'walk','MAP_CHECKIN_4_promising_window; revealed_as_backlit_product_display_on_actual_view'),
 (ls(68),'CHASE_FAST',78,0,'run','CHORUS2_rooms_move_to_hunt_him; MINO_pursues_erasing_thread_behind'),
 (ls(73),'FPV',80,0,'turn_right','round_another_corner'),
 (ls(74),'FPV',80,0,'run','past_another_door'),
 (ls(75),'CHASE_FAST',78,0,'run','chorus_continue'),
 (ls(80),'CHASE_FAST',80,0,'run','instrumental_chase; MINO_charge'),
 (ls(81),'FPV',72,0,'walk','BREAK2_shelf_uprights_resolve_into_minoan_columns; floor_graphics_become_fresco; harpsichord_glitch'),
 (ls(85),'MAP_ORBIT',40,0,'walk','minoan_orbit_sung_bars; labrys_shelving'),
 (171.60,'CHASE_FAST',75,0,'run','glitch_build'),
 (ls(89),'CHASE_FAST',80,0,'run','FINAL_CHORUS; arrows_peel_hesitate_swarm_toward_him; he_looks_down_at_amber_thread; objective=FIND OWN ROOM'),
 (ls(91),'CHASE_FAST',80,0,'run','ICARUS_lamps_droop_like_wax_cables_like_failed_wings'),
 (ls(94),'FPV',80,0,'turn_left','past_the_final_corner'),
 (ls(95),'FPV',75,0,'walk','quiet_threshold_hud_off_thread_leads_through_sliding_door'),
 (ls(98),'CHASE',65,0,'walk','he_lays_one_arrow_in_MINO_path_MINO_obeys_and_turns_away; follows_thread_out_through_the_glow'),
 (ls(101),'CHASE',55,0,'slowmo','now_i_know'),
 (ls(102),'EXT',45,0,'walk','car_park_neutral_cold_grade; carries_flatpack_bag; SEAMLESS_RISE_2_MAP_CHECKIN_5_real_store_footprint_is_the_maze'),
 (ls(104),'FPV',60,-50,'look_down','look_inside_bag'),
 (ls(105),'FPV',55,-50,'look_down','half_shelf_reveal; text=OTHER HALF SOLD SEPARATELY held_until_cut'),
 (210.06,'BLACK',55,0,'idle','hard_cut_on_bass_hit'),
]
plan.sort(key=lambda p:p[0])
# lyric per telemetry: include every line too
tel=[]
for t,mode,fov,tilt,sp,ev in plan:
    tel.append(dict(frame=int(round(t*FPS)),lyric='',sprite_state=sp,camera_fov=fov,environment_tilt_degrees=tilt,special_events=ev,camera_mode=mode))
for l in L:
    tel.append(dict(frame=int(round(l['start_s']*FPS)),lyric=l['text'],sprite_state=None,camera_fov=None,environment_tilt_degrees=None,special_events='lyric_line',camera_mode=None,section=l['section']))
tel.sort(key=lambda x:(x['frame'],x['special_events']=='lyric_line'))
# carry forward state into lyric entries so every row is complete
cur={}
for r in tel:
    for k in ['sprite_state','camera_fov','environment_tilt_degrees','camera_mode']:
        if r[k] is None: r[k]=cur.get(k)
        else: cur[k]=r[k]
m=dict(track_name='The Showroom Labyrinth', manifest_version='v2 (creative notes merged 11 Nov 14:22)', symbols=dict(yellow_arrows='instructions, imposed route (the lie)', amber_thread='his own route, memory; never yellow', white_price_tags='system turns everything into inventory'), grade=dict(normal='cyan:amber 1:2', loop='1:1', pursuit='2:1 warm key on face', escape='amber thread vs cyan', car_park='neutral cold daylight'),bpm=179,resolution_target='1920x1080',total_frames_at_30fps=N,
  fps=30,duration_s=a['duration_s'],source=dict(suno_id='bff0ed1e-0748-4185-9d81-5a6810c35168',wav='audio_master.wav (Suno WAV download 11 Nov 2026, 48 kHz s16 stereo)'),
  bpm_note='Measured: Suno grid 178.9, librosa 176-182 (frame-quantised). Half-time feel 89.5 in verses. Engine timing uses acoustic.beats_s, never this field.',
  loudness=dict(integrated_lufs=-15.9,true_peak_dbtp=-4.0,flag='none: below -1 dBTP'),
  sections=a['sections'],telemetry=tel,
  acoustic={k:a[k] for k in ['beats_s','downbeats_s','onset_env_30fps','kick_env_30fps','bass_env_30fps','hats_env_30fps','rms_30fps','kick_frames','words','lines']})
json.dump(m,open('manifest.json','w'))
print('telemetry rows',len(tel),'camera events',len(plan),'size KB',len(json.dumps(m))//1024)
