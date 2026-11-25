package com.example.android_project.ui.expense

import android.content.Intent
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.widget.Button
import android.widget.TextView
import androidx.lifecycle.lifecycleScope
import com.example.android_project.R
import com.example.android_project.data.ExpenseRepository
import com.example.android_project.data.UserRepository
import com.example.android_project.model.Expense
import com.example.android_project.model.won
import com.example.android_project.ui.BaseActivity
import com.example.android_project.util.ApiError
import com.example.android_project.util.Msg
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.google.gson.Gson
import kotlinx.coroutines.launch

/** 지출 상세: 분담 내역과 정산 상태. 결제한 사람은 정산 완료 표시, 수정, 삭제를 할 수 있다. */
class ExpenseDetailActivity : BaseActivity() {

    companion object {
        const val EXTRA_ROOM_ID = "roomId"
        const val EXTRA_EXPENSE_ID = "expenseId"
    }

    private lateinit var repo: ExpenseRepository
    private var roomId = 0
    private var expenseId = 0
    private var myUserId: Int? = null
    private var expense: Expense? = null
    private val gson = Gson()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_expense_detail)

        roomId = intent.getIntExtra(EXTRA_ROOM_ID, 0)
        expenseId = intent.getIntExtra(EXTRA_EXPENSE_ID, 0)
        repo = ExpenseRepository(this)

        findViewById<View>(R.id.ivBack).setOnClickListener { finish() }
        findViewById<Button>(R.id.btnEditExpense).setOnClickListener {
            val e = expense ?: return@setOnClickListener
            startActivity(
                Intent(this, ExpenseFormActivity::class.java)
                    .putExtra(ExpenseFormActivity.EXTRA_ROOM_ID, roomId)
                    .putExtra(ExpenseFormActivity.EXTRA_EXPENSE_JSON, gson.toJson(e))
            )
        }
        findViewById<Button>(R.id.btnDeleteExpense).setOnClickListener { confirmDelete() }
    }

    override fun onResume() {
        super.onResume()
        load()
    }

    private fun load() {
        lifecycleScope.launch {
            try {
                if (myUserId == null) {
                    val me = UserRepository(this@ExpenseDetailActivity).getMe()
                    myUserId = me?.body()?.getAsJsonObject("user")?.get("userId")?.asInt
                }
                val response = repo.get(roomId, expenseId) ?: return@launch
                if (response.isSuccessful) {
                    val json = response.body()?.getAsJsonObject("expense") ?: return@launch
                    expense = gson.fromJson(json, Expense::class.java)
                    show(expense!!)
                } else {
                    Msg.show(this@ExpenseDetailActivity, ApiError.messageOf(response, "지출을 불러오지 못했어요."))
                    if (response.code() == 404) finish()
                }
            } catch (e: Exception) {
                Msg.show(this@ExpenseDetailActivity, "서버에 연결할 수 없어요.")
            }
        }
    }

    private fun show(e: Expense) {
        val iAmPayer = e.payer?.userId == myUserId

        findViewById<TextView>(R.id.tvDetailTitle).text = e.title
        findViewById<TextView>(R.id.tvDetailAmount).text = e.amount.won()
        findViewById<TextView>(R.id.tvDetailMeta).text =
            "${e.expenseDate} · ${e.payer?.displayName() ?: "알 수 없음"} 결제 · ${if (e.allSettled) "정산 완료" else "정산 중"}"

        val container = findViewById<android.view.ViewGroup>(R.id.layoutShares)
        container.removeAllViews()
        for (s in e.shares) {
            val row = LayoutInflater.from(this).inflate(R.layout.item_share, container, false)
            row.findViewById<TextView>(R.id.tvShareName).text = s.user?.displayName() ?: "알 수 없음"
            row.findViewById<TextView>(R.id.tvShareAmount).text = s.amount.won()
            row.findViewById<TextView>(R.id.tvShareState).text = when {
                s.isPayer -> "결제한 사람"
                s.isSettled -> "정산 완료"
                else -> "정산 전"
            }

            // 돈을 받은 결제자만 다른 사람의 분담을 정산 완료로 표시하거나 취소할 수 있다.
            val button = row.findViewById<Button>(R.id.btnShareSettle)
            val target = s.user
            if (iAmPayer && !s.isPayer && target != null) {
                button.visibility = View.VISIBLE
                button.text = if (s.isSettled) "취소" else "받았어요"
                button.setOnClickListener { settle(target.userId, !s.isSettled) }
            }
            container.addView(row)
        }

        val hint = findViewById<TextView>(R.id.tvDetailHint)
        val anySettled = e.shares.any { it.isSettled && !it.isPayer }
        if (iAmPayer) {
            hint.visibility = View.VISIBLE
            hint.text = if (anySettled) "정산된 분담이 있어 금액과 분담은 수정할 수 없고, 삭제도 할 수 없어요. 정산을 취소하면 다시 할 수 있어요."
            else "돈을 받으면 '받았어요'를 눌러 정산 완료로 표시해 주세요."
        } else {
            hint.visibility = View.GONE
        }
        findViewById<View>(R.id.btnEditExpense).visibility = if (iAmPayer) View.VISIBLE else View.GONE
        findViewById<View>(R.id.btnDeleteExpense).visibility = if (iAmPayer) View.VISIBLE else View.GONE
    }

    private fun settle(userId: Int, settled: Boolean) {
        lifecycleScope.launch {
            try {
                val response = repo.settle(roomId, expenseId, userId, settled) ?: return@launch
                if (response.isSuccessful) load()
                else Msg.show(this@ExpenseDetailActivity, ApiError.messageOf(response, "처리하지 못했어요."))
            } catch (e: Exception) {
                Msg.show(this@ExpenseDetailActivity, "서버에 연결할 수 없어요.")
            }
        }
    }

    private fun confirmDelete() {
        MaterialAlertDialogBuilder(this)
            .setTitle("지출 삭제")
            .setMessage("이 지출을 삭제할까요? 삭제하면 되돌릴 수 없어요.")
            .setNegativeButton("취소", null)
            .setPositiveButton("삭제") { _, _ ->
                lifecycleScope.launch {
                    try {
                        val response = repo.delete(roomId, expenseId) ?: return@launch
                        if (response.isSuccessful) {
                            Msg.show(this@ExpenseDetailActivity, "지출을 삭제했어요.")
                            finish()
                        } else {
                            Msg.show(this@ExpenseDetailActivity, ApiError.messageOf(response, "삭제하지 못했어요."), true)
                        }
                    } catch (e: Exception) {
                        Msg.show(this@ExpenseDetailActivity, "서버에 연결할 수 없어요.")
                    }
                }
            }
            .show()
    }
}