package com.example.android_project.model

// 내 정보 (GET /api/users/me). 계좌는 마지막 4자리만 보이도록 마스킹되어 온다. 비밀번호 관련 값은 오지 않는다.
data class User(
    val userId: Int,
    val loginId: String,
    val name: String,
    val nickname: String,
    val phone: String,
    val accountMasked: String?,
    val birthDate: String?,
    val gender: String?,
    val email: String? = null,
    val stats: UserStats? = null,
    // 프로필 사진: 없으면 photoVersion이 null. photoPublic은 같은 방 구성원에게 보일지.
    val photoVersion: Long? = null,
    val photoPublic: Boolean = true,
    val room: UserRoom?
) {
    // MALE / FEMALE / OTHER → 화면에 보일 글자
    fun genderText(): String = when (gender) {
        "MALE" -> "남성"
        "FEMALE" -> "여성"
        "OTHER" -> "기타"
        else -> "-"
    }
}

// 활동 요약. completedCleanings: 내가 직접 완료한 청소 횟수
data class UserStats(
    val completedCleanings: Int = 0,
    // 내 청소를 다른 사람이 대신 끝내 준 횟수
    val helpedCleanings: Int = 0
)

// 내가 가입한 방 (없으면 null)
data class UserRoom(
    val roomId: Int,
    val roomName: String,
    val isOwner: Boolean
) {
    fun roleText(): String = if (isOwner) "방장" else "멤버"
}

// 이름·닉네임·전화번호 수정. 바꾸지 않은 항목은 null로 두면 보내지 않는다.
data class UpdateMeRequest(
    val name: String? = null,
    val nickname: String? = null,
    val phone: String? = null,
    // 이메일을 지우려면 빈 문자열("")을 보낸다.
    val email: String? = null
)

data class ChangePasswordRequest(
    val currentPassword: String,
    val newPassword: String
)

data class ChangeAccountRequest(
    val currentPassword: String,
    val accountInfo: String
)
