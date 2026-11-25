package com.example.android_project.model

import java.time.Duration
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter

// 서버가 만들어 둔 알림 한 건. type: ITEM_EXPIRY / CLEANING_DUE / SCHEDULE_START / EXPENSE_SHARE / EXPENSE_SETTLED / CLEANING_REASSIGNED
data class AppNotification(
    val notificationId: Int,
    val roomId: Int? = null,
    val type: String,
    val title: String,
    val body: String,
    val target: NotificationTarget? = null,   // 눌렀을 때 이동할 대상 (ITEM / SCHEDULE / CLEANING_TASK / EXPENSE)
    val isRead: Boolean = false,
    val createdAt: String = ""
) {
    // "방금 전", "5분 전", "3시간 전", "어제", "11.25" 처럼 보여준다. (서버 시각은 시간대 없는 "YYYY-MM-DD HH:mm:ss")
    fun timeText(now: LocalDateTime = LocalDateTime.now()): String {
        val created = try {
            LocalDateTime.parse(createdAt.replace(' ', 'T').take(19))
        } catch (e: Exception) {
            return ""
        }

        val minutes = Duration.between(created, now).toMinutes()
        return when {
            minutes < 1 -> "방금 전"
            minutes < 60 -> "${minutes}분 전"
            minutes < 24 * 60 -> "${minutes / 60}시간 전"
            created.toLocalDate() == LocalDate.now().minusDays(1) -> "어제"
            else -> created.format(DateTimeFormatter.ofPattern("M.d"))
        }
    }
}

data class NotificationTarget(
    val type: String,
    val id: Int
)
