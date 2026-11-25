package com.example.android_project.model

// 서버의 지출·정산. 사람은 { userId, nickname, status } 로 온다. status: MEMBER(현재 구성원) / LEFT(나감) / KICKED(내보내짐)
data class UserLabel(
    val userId: Int,
    val nickname: String? = null,
    val status: String? = null
) {
    fun displayName(): String {
        val base = nickname ?: "알 수 없음"
        return if (status == null || status == "MEMBER") base else "$base (나감)"
    }
}

data class ExpenseShare(
    val user: UserLabel? = null,
    val amount: Int = 0,
    val isSettled: Boolean = false,
    val isPayer: Boolean = false
)

data class Expense(
    val expenseId: Int,
    val title: String,
    val amount: Int,
    val expenseDate: String,
    val payer: UserLabel? = null,
    val shares: List<ExpenseShare> = emptyList(),
    val allSettled: Boolean = false
)

// amount: 양수면 상대가 나에게 줄 돈, 음수면 내가 상대에게 줄 돈
data class Balance(
    val user: UserLabel? = null,
    val amount: Int = 0
)

fun Int.won(): String = "%,d원".format(this)