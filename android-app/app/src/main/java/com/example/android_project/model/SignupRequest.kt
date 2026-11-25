package com.example.android_project.model

data class SignupRequest(
    val loginId: String,
    val password: String,
    val name: String,
    val nickname: String,
    val phone: String,
    // 선택. 비우면 보내지 않는다.
    val email: String? = null,
    val accountInfo: String,
    val birthDate: String,
    val gender: String,
    // 약관 제4조: 이용약관과 개인정보 수집·이용에 동의해야 가입할 수 있다.
    val agreeTerms: Boolean = false,
    val agreePrivacy: Boolean = false
)
