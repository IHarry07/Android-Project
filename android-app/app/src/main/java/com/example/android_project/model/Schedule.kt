package com.example.android_project.model

import java.time.Duration
import java.time.LocalDate
import java.time.LocalDateTime

// 서버의 일정. 시각은 시간대 없이 "YYYY-MM-DD HH:mm:ss" 문자열로 온다.
// visibility: SHARED(방 구성원 모두) / PERSONAL(작성자만)
data class Schedule(
    val scheduleId: Int,
    val title: String,
    val description: String?,
    val visibility: String,
    val startAt: String,
    val endAt: String,
    val authorUserId: Int,
    val authorNickname: String?,
    // 시작 몇 분 전에 알릴지. null이면 알림 없음
    val reminderMinutes: Int? = 60
) {
    val start: LocalDateTime get() = parse(startAt)
    val end: LocalDateTime get() = parse(endAt)

    val isPersonal: Boolean get() = visibility == "PERSONAL"

    // 이 일정이 date 날짜와 겹치는지 (여러 날에 걸친 일정 포함)
    fun coversDate(date: LocalDate): Boolean =
        !start.toLocalDate().isAfter(date) && !end.toLocalDate().isBefore(date)

    // "30분", "1시간", "1시간 30분"
    fun durationText(): String {
        val minutes = Duration.between(start, end).toMinutes()
        return when {
            minutes <= 0 -> "시간 지정"
            minutes < 60 -> "${minutes}분"
            minutes % 60 == 0L -> "${minutes / 60}시간"
            minutes < 24 * 60 -> "${minutes / 60}시간 ${minutes % 60}분"
            else -> "${minutes / (24 * 60)}일"
        }
    }

    companion object {
        fun parse(text: String): LocalDateTime =
            LocalDateTime.parse(text.replace(' ', 'T').take(19))
    }
}

// 일정 추가. description은 비우면 보내지 않고, visibility는 SHARED / PERSONAL
data class CreateScheduleRequest(
    val title: String,
    val startAt: String,
    val endAt: String,
    val description: String? = null,
    val visibility: String = "SHARED",
    // 시작 몇 분 전에 알릴지. null이면 알림 없음 (null도 서버에 전달돼야 해서 항상 보낸다.)
    val reminderMinutes: Int? = 60
)

// 서버가 담당자를 알려주는 형식 (status: MEMBER 현재 구성원 / LEFT 나감 / KICKED 내보냄)
data class Assignee(
    val userId: Int?,
    val nickname: String?,
    val status: String?
)

// 방 청소 당번 (캘린더에는 다음 예정일에 표시한다)
data class CleaningTask(
    val taskId: Int,
    val areaName: String,
    val assignee: Assignee?,
    val nextDueDate: String,
    val repeatType: String? = null,
    val repeatInterval: Int? = null,
    val rotationEnabled: Boolean = false,
    val isActive: Boolean = true,
    val isSubstitute: Boolean = false,  // 이번 회차만 다른 사람이 대신하는 중인지
    val baseAssignee: Assignee? = null, // 대신하는 중이라면 원래 담당자 (회차가 끝나면 원래 담당자로 돌아간다)
    val isPostponed: Boolean = false,   // 이번 회차를 이미 한 번 미뤘는지 (다시 미룰 수 없다)
    val postponeUntil: String? = null,  // 미룰 수 있는 마지막 날 (예정일에서 7일 뒤)
    val isOverdue: Boolean
)

// 청소 이력 한 건. status: SCHEDULED(예정) / DONE(완료) / POSTPONED(미룸) / SKIPPED(건너뜀)
data class CleaningRecord(
    val recordId: Int,
    val dueDate: String,
    val status: String,
    val assignee: Assignee?,
    val completedBy: Assignee?,
    val completedAt: String?,
    val postponedTo: String?,
    val memo: String?
)

// 청소 이력 한 건 (GET cleaning-history). type: DONE(완료) / SKIPPED(건너뜀) / POSTPONED(미룸) / REASSIGNED(담당자 변경)
data class CleaningEvent(
    val type: String,
    val taskId: Int,
    val areaName: String,
    val dueDate: String,
    val assignee: Assignee? = null,       // 완료·건너뜀·미룸: 그 회차의 담당자
    val completedBy: Assignee? = null,    // 완료: 실제로 한 사람
    val postponedTo: String? = null,      // 미룸: 미룬 날짜
    val fromAssignee: Assignee? = null,   // 담당자 변경: 이전 담당자
    val toAssignee: Assignee? = null,     // 담당자 변경: 새 담당자
    val changedBy: Assignee? = null,      // 담당자 변경: 바꾼 사람
    val scope: String? = null,            // 담당자 변경: ONCE(이번만) / ALWAYS(계속)
    val memo: String? = null              // 메모 또는 변경 사유
)

// 담당자 바꾸기 요청. scope: ONCE(이번 회차만 대신) / ALWAYS(앞으로 계속)
data class ReassignCleaningRequest(
    val assigneeUserId: Int,
    val scope: String,
    val reason: String? = null,
    val dueDate: String? = null
)

// 완료·건너뛰기 요청. dueDate는 화면에 보이던 예정일이다. 그 사이 다른 사람이 먼저 처리했다면 서버가 거절한다.
data class CleaningActionRequest(
    val dueDate: String? = null,
    val memo: String? = null
)

// 미루기 요청
data class PostponeCleaningRequest(
    val dueDate: String? = null,
    val postponedTo: String,
    val memo: String? = null
)
