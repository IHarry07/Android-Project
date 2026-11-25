package com.example.android_project.model

data class LoginRequest(
    val loginId: String,
    val password: String,
    val keepLogin: Boolean
)

// 비밀번호 찾기 1단계: 가입 정보(아이디, 이름, 전화번호, 생년월일)가 모두 맞으면 확인 토큰(resetToken)을 받는다.
data class VerifyIdentityRequest(
    val loginId: String,
    val name: String,
    val phone: String,
    val birthDate: String
)

// 비밀번호 찾기 2단계: 확인 토큰으로 새 비밀번호를 정한다.
data class ResetPasswordRequest(
    val resetToken: String,
    val newPassword: String
)
