package com.example.android_project.util

/**
 * 입력 검사 규칙. 서버(backend/src/utils/schemas.js)와 같다.
 * 서버도 다시 검사하므로, 여기서는 불필요한 요청을 줄이는 것이 목적이다.
 * 값이 올바르면 null, 아니면 화면에 보일 안내 문구를 돌려준다.
 */
object InputRules {

    fun passwordError(v: String): String? = when {
        v.length < 8 -> "비밀번호는 8자 이상이어야 합니다."
        v.toByteArray(Charsets.UTF_8).size > 72 -> "비밀번호가 너무 깁니다."
        !v.any { it in 'A'..'Z' || it in 'a'..'z' } || !v.any { it.isDigit() } ->
            "비밀번호에는 영문자와 숫자가 모두 들어가야 합니다."
        else -> null
    }

    fun nameError(v: String): String? =
        if (v.isEmpty() || v.length > 50) "이름은 1~50자로 입력해 주세요." else null

    fun nicknameError(v: String): String? =
        if (!Regex("^[가-힣a-zA-Z0-9_]{2,20}$").matches(v)) {
            "닉네임은 한글, 영문, 숫자, 밑줄(_)로 2~20자여야 합니다."
        } else null

    // 이메일은 선택이라 비어 있으면 괜찮고, 입력했다면 형식이 맞아야 한다.
    fun emailError(v: String): String? = when {
        v.isEmpty() -> null
        v.length > 100 -> "이메일은 100자 이하로 입력해 주세요."
        !android.util.Patterns.EMAIL_ADDRESS.matcher(v).matches() -> "이메일 형식이 올바르지 않아요."
        else -> null
    }

    fun phoneError(v: String): String? {
        val digits = v.filter { it.isDigit() }
        return if (!Regex("^01[016789]\\d{7,8}$").matches(digits)) {
            "전화번호 형식이 올바르지 않습니다. 예: 010-1234-5678"
        } else null
    }

    fun accountError(v: String): String? = when {
        v.length < 5 || v.length > 100 -> "계좌 정보는 5~100자로 입력해 주세요."
        !Regex("\\d{4,}").containsMatchIn(v.replace("-", "").replace(" ", "")) ->
            "계좌번호(숫자)가 포함되어야 합니다."
        else -> null
    }
}
