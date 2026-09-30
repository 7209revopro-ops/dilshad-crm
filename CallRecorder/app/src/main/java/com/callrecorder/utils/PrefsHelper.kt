package com.callrecorder.utils

import android.content.Context
import androidx.core.content.edit

object PrefsHelper {

    private const val PREFS_NAME = "call_recorder_prefs"

    private const val KEY_AUTO_RECORD           = "auto_record_enabled"
    private const val KEY_USE_VOICE_CALL_SOURCE = "use_voice_call_source"
    private const val KEY_FORCE_SPEAKER_MODE    = "force_speaker_mode"

    // ── Auto-record ───────────────────────────────────────────────────────────

    fun isAutoRecordEnabled(context: Context): Boolean =
        prefs(context).getBoolean(KEY_AUTO_RECORD, true)

    fun setAutoRecordEnabled(context: Context, enabled: Boolean) =
        prefs(context).edit { putBoolean(KEY_AUTO_RECORD, enabled) }

    // ── VOICE_CALL source (legacy Android ≤ 8 toggle) ────────────────────────

    fun useVoiceCallSource(context: Context): Boolean =
        prefs(context).getBoolean(KEY_USE_VOICE_CALL_SOURCE, false)

    fun setUseVoiceCallSource(context: Context, use: Boolean) =
        prefs(context).edit { putBoolean(KEY_USE_VOICE_CALL_SOURCE, use) }

    // ── Force Speaker Mode (Layer 2 — works on ALL Android versions) ──────────
    //
    // When enabled, the service routes call audio to the speaker before recording.
    // The MIC then physically captures both the user's voice AND the other party's
    // voice from the speaker — guaranteeing both-sides capture on every device.
    //
    // Trade-off: the call will be audible on the speaker during recording.

    fun forceSpeakerMode(context: Context): Boolean =
        prefs(context).getBoolean(KEY_FORCE_SPEAKER_MODE, false)

    fun setForceSpeakerMode(context: Context, enabled: Boolean) =
        prefs(context).edit { putBoolean(KEY_FORCE_SPEAKER_MODE, enabled) }

    // ── Helper ────────────────────────────────────────────────────────────────

    private fun prefs(context: Context) =
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
}
