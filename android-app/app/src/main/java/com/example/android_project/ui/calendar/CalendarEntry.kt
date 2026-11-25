package com.example.android_project.ui.calendar

import com.example.android_project.R
import com.example.android_project.model.Schedule
import java.time.LocalDate
import java.time.LocalDateTime

// 캘린더에 보이는 항목의 종류
enum class EntryKind(val colorRes: Int) {
    SHARED(R.color.rm_primary),          // 방 공유 일정
    PERSONAL(R.color.rm_title),          // 개인 일정 (나만 보임)
    CLEANING(R.color.rm_kind_cleaning),  // 청소 당번 예정일
    EXPIRY(R.color.rm_kind_expiry)       // 물품 유통기한
}

// 일정·청소·유통기한을 한 목록으로 보여주기 위한 공통 모양
data class CalendarEntry(
    val kind: EntryKind,
    val startDate: LocalDate,
    val endDate: LocalDate,
    val sortKey: LocalDateTime,
    val timeLabel: String,          // 왼쪽 큰 글씨 (예: 14:00, 청소, 유통기한)
    val subLabel: String,           // 그 아래 작은 글씨 (예: 14:30, 당번 지우)
    val title: String,
    val meta: String,
    val schedule: Schedule? = null  // 일정일 때만. 눌렀을 때 수정·삭제에 쓴다.
) {
    fun coversDate(date: LocalDate): Boolean =
        !startDate.isAfter(date) && !endDate.isBefore(date)

    // 시간이 정해지지 않은 하루짜리 항목 (청소, 유통기한)
    val isAllDay: Boolean get() = schedule == null
}
