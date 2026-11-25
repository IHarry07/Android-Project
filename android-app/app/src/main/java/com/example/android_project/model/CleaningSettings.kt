package com.example.android_project.model

// 청소당번 설정 (GET/PUT api/rooms/{roomId}/cleaning-settings)
// repeat: WEEKLY(매주) / BIWEEKLY(격주) / MONTHLY(매월)
// rows의 순서가 순번이다. weekday는 0=일요일 ... 6=토요일.
data class CleaningSettings(
    val repeat: String,
    val rotation: Boolean,
    val rows: List<CleaningRow>
)

data class CleaningRow(
    val taskId: Int?,
    val userId: Int?,
    val nickname: String?,
    val areaName: String,
    val weekday: Int,
    val nextDueDate: String?
)

// 저장할 때 보내는 값. taskId가 없으면 새 줄이다.
data class SaveCleaningSettingsRequest(
    val repeat: String,
    val rotation: Boolean,
    val rows: List<SaveCleaningRow>
)

data class SaveCleaningRow(
    val taskId: Int?,
    val userId: Int,
    val areaName: String,
    val weekday: Int
)
