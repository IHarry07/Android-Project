package com.example.android_project.ui.expense

import android.app.DatePickerDialog
import android.os.Bundle
import android.text.Editable
import android.text.TextWatcher
import android.view.LayoutInflater
import android.view.View
import android.widget.Button
import android.widget.CheckBox
import android.widget.EditText
import android.widget.TextView
import androidx.lifecycle.lifecycleScope
import com.example.android_project.R
import com.example.android_project.data.ExpenseRepository
import com.example.android_project.data.RoomRepository
import com.example.android_project.model.Expense
import com.example.android_project.model.RoomMember
import com.example.android_project.model.won
import com.example.android_project.ui.BaseActivity
import com.example.android_project.util.ApiError
import com.example.android_project.util.Msg
import com.google.gson.Gson
import com.google.gson.JsonArray
import com.google.gson.JsonObject
import kotlinx.coroutines.launch
import java.time.LocalDate

/**
 * 지출 등록·수정. 내용, 금액, 날짜, 함께한 사람을 정하고 똑같이 나누거나 사람마다 금액을 직접 정한다.
 * 이미 정산된 분담이 있는 지출은 서버가 금액·분담 변경을 막으므로, 그때는 내용과 날짜만 고칠 수 있다.
 */
class ExpenseFormActivity : BaseActivity() {

    companion object {
        const val EXTRA_ROOM_ID = "roomId"
        const val EXTRA_EXPENSE_JSON = "expenseJson"
    }

    private class Row(
        val member: RoomMember,
        val check: CheckBox,
        val amountEdit: EditText,
        val amountText: TextView
    )

    private lateinit var repo: ExpenseRepository
    private lateinit var etTitle: EditText
    private lateinit var etAmount: EditText
    private lateinit var tvDate: TextView
    private lateinit var chipEqual: TextView
    private lateinit var chipCustom: TextView
    private lateinit var layoutParticipants: android.view.ViewGroup
    private lateinit var tvHint: TextView
    private lateinit var btnSave: Button

    private var roomId = 0
    private var editing: Expense? = null
    private var lockedShares = false // 정산된 분담이 있으면 금액·분담은 못 고친다.
    private var custom = false
    private var date: LocalDate = LocalDate.now()
    private val rows = mutableListOf<Row>()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_expense_form)

        roomId = intent.getIntExtra(EXTRA_ROOM_ID, 0)
        repo = ExpenseRepository(this)
        editing = intent.getStringExtra(EXTRA_EXPENSE_JSON)?.let { Gson().fromJson(it, Expense::class.java) }

        etTitle = findViewById(R.id.etExpenseTitle)
        etAmount = findViewById(R.id.etExpenseAmount)
        tvDate = findViewById(R.id.tvExpenseDate)
        chipEqual = findViewById(R.id.chipEqual)
        chipCustom = findViewById(R.id.chipCustom)
        layoutParticipants = findViewById(R.id.layoutParticipants)
        tvHint = findViewById(R.id.tvSplitHint)
        btnSave = findViewById(R.id.btnSaveExpense)

        findViewById<View>(R.id.ivBack).setOnClickListener { finish() }
        tvDate.setOnClickListener { pickDate() }
        chipEqual.setOnClickListener { setMode(false) }
        chipCustom.setOnClickListener { setMode(true) }
        btnSave.setOnClickListener { save() }
        etAmount.addTextChangedListener(refreshWatcher())

        editing?.let { e ->
            findViewById<TextView>(R.id.tvFormTitle).text = "지출 수정"
            etTitle.setText(e.title)
            etAmount.setText(e.amount.toString())
            date = runCatching { LocalDate.parse(e.expenseDate.take(10)) }.getOrDefault(date)
            lockedShares = e.shares.any { it.isSettled && !it.isPayer }
            // 분담 금액이 모두 같으면(1원 차이 포함) 똑같이 나누기로 보여준다.
            val amounts = e.shares.map { it.amount }
            custom = amounts.isNotEmpty() && (amounts.max() - amounts.min() > 1)
        }
        showDate()
        updateChips()
        loadMembers()
    }

    private fun pickDate() {
        DatePickerDialog(this, { _, y, m, d ->
            date = LocalDate.of(y, m + 1, d)
            showDate()
        }, date.year, date.monthValue - 1, date.dayOfMonth).show()
    }

    private fun showDate() {
        tvDate.text = date.toString()
    }

    private fun setMode(isCustom: Boolean) {
        if (lockedShares || custom == isCustom) return
        custom = isCustom
        updateChips()
        refresh()
    }

    private fun updateChips() {
        chipEqual.setBackgroundResource(if (!custom) R.drawable.bg_chip_on else R.drawable.bg_chip_off)
        chipCustom.setBackgroundResource(if (custom) R.drawable.bg_chip_on else R.drawable.bg_chip_off)
        chipEqual.setTextColor(getColor(if (!custom) R.color.white else R.color.rm_sub))
        chipCustom.setTextColor(getColor(if (custom) R.color.white else R.color.rm_sub))
    }

    private fun loadMembers() {
        lifecycleScope.launch {
            try {
                val response = RoomRepository(this@ExpenseFormActivity).getRoomMembers(roomId) ?: return@launch
                if (!response.isSuccessful) {
                    Msg.show(this@ExpenseFormActivity, ApiError.messageOf(response, "구성원을 불러오지 못했어요."))
                    return@launch
                }
                val members = response.body()?.getAsJsonArray("members")
                    ?.map { Gson().fromJson(it, RoomMember::class.java) }.orEmpty()
                buildRows(members)
            } catch (e: Exception) {
                Msg.show(this@ExpenseFormActivity, "서버에 연결할 수 없어요.")
            }
        }
    }

    private fun buildRows(members: List<RoomMember>) {
        layoutParticipants.removeAllViews()
        rows.clear()
        val existing = editing?.shares?.associateBy { it.user?.userId }
        for (m in members) {
            val view = LayoutInflater.from(this).inflate(R.layout.item_participant, layoutParticipants, false)
            val row = Row(
                m,
                view.findViewById(R.id.cbParticipant),
                view.findViewById(R.id.etParticipantAmount),
                view.findViewById(R.id.tvParticipantAmount)
            )
            row.check.text = m.nickname
            val share = existing?.get(m.userId)
            row.check.isChecked = if (editing == null) true else share != null
            if (share != null) row.amountEdit.setText(share.amount.toString())
            row.check.setOnCheckedChangeListener { _, _ -> refresh() }
            row.amountEdit.addTextChangedListener(refreshWatcher())
            if (lockedShares) {
                row.check.isEnabled = false
                row.amountEdit.isEnabled = false
                etAmount.isEnabled = false
            }
            layoutParticipants.addView(view)
            rows.add(row)
        }
        refresh()
    }

    private fun refreshWatcher() = object : TextWatcher {
        override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
        override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
        override fun afterTextChanged(s: Editable?) = refresh()
    }

    private fun totalAmount(): Int? = etAmount.text.toString().trim().toIntOrNull()?.takeIf { it > 0 }

    /** 똑같이 나눌 때 한 사람 몫. 나누어떨어지지 않는 1원 단위는 앞에서부터 한 명씩 더 낸다. (서버와 같은 규칙) */
    private fun equalShares(total: Int, count: Int): List<Int> {
        val base = total / count
        val rest = total - base * count
        return List(count) { i -> base + if (i < rest) 1 else 0 }
    }

    private fun refresh() {
        val chosen = rows.filter { it.check.isChecked }
        val total = totalAmount()

        if (lockedShares) {
            tvHint.text = "정산된 분담이 있어 금액과 분담은 바꿀 수 없어요. 내용과 날짜만 고칠 수 있어요."
        }

        if (!custom) {
            val shares = if (total != null && chosen.isNotEmpty()) equalShares(total, chosen.size) else emptyList()
            rows.forEach { it.amountEdit.visibility = View.GONE; it.amountText.visibility = View.VISIBLE; it.amountText.text = "" }
            chosen.forEachIndexed { i, r -> if (i < shares.size) r.amountText.text = shares[i].won() }
            if (!lockedShares) {
                tvHint.text = if (chosen.isEmpty()) "함께한 사람을 한 명 이상 골라 주세요."
                else "고른 ${chosen.size}명이 똑같이 나눠요. 나누어떨어지지 않는 1원 단위는 앞사람부터 한 명씩 더 내요."
            }
        } else {
            rows.forEach {
                it.amountText.visibility = View.GONE
                it.amountEdit.visibility = if (it.check.isChecked) View.VISIBLE else View.GONE
            }
            if (!lockedShares) {
                val sum = chosen.sumOf { it.amountEdit.text.toString().trim().toIntOrNull() ?: 0 }
                tvHint.text = when {
                    total == null -> "총 금액을 먼저 입력해 주세요."
                    sum == total -> "합계 ${sum.won()} · 총 금액과 같아요."
                    else -> "합계 ${sum.won()} · 총 금액 ${total.won()}과 ${kotlin.math.abs(total - sum).won()} 차이가 나요."
                }
            }
        }
    }

    private fun save() {
        val title = etTitle.text.toString().trim()
        if (title.isEmpty()) {
            etTitle.error = "내용을 입력해 주세요."
            return
        }

        val body = JsonObject().apply {
            addProperty("title", title)
            addProperty("expenseDate", date.toString())
        }

        if (!lockedShares) {
            val total = totalAmount()
            if (total == null) {
                etAmount.error = "금액을 입력해 주세요."
                return
            }
            val chosen = rows.filter { it.check.isChecked }
            if (chosen.isEmpty()) {
                Msg.show(this, "함께한 사람을 한 명 이상 골라 주세요.")
                return
            }
            body.addProperty("amount", total)

            if (!custom) {
                body.add("participantUserIds", JsonArray().also { a -> chosen.forEach { a.add(it.member.userId) } })
            } else {
                val amounts = chosen.map { it.amountEdit.text.toString().trim().toIntOrNull() ?: 0 }
                if (amounts.any { it <= 0 }) {
                    Msg.show(this, "고른 사람마다 금액을 입력해 주세요.")
                    return
                }
                if (amounts.sum() != total) {
                    Msg.show(this, "나눈 금액의 합이 총 금액과 같아야 해요.", true)
                    return
                }
                body.add("shares", JsonArray().also { a ->
                    chosen.forEachIndexed { i, r ->
                        a.add(JsonObject().apply { addProperty("userId", r.member.userId); addProperty("amount", amounts[i]) })
                    }
                })
            }
        }

        btnSave.isEnabled = false
        lifecycleScope.launch {
            try {
                val e = editing
                val response = if (e == null) repo.create(roomId, body) else repo.update(roomId, e.expenseId, body)
                if (response != null && response.isSuccessful) {
                    Msg.show(this@ExpenseFormActivity, if (e == null) "지출을 등록했어요." else "지출을 수정했어요.")
                    finish()
                } else if (response != null) {
                    Msg.show(this@ExpenseFormActivity, ApiError.messageOf(response, "저장하지 못했어요."), true)
                }
            } catch (ex: Exception) {
                Msg.show(this@ExpenseFormActivity, "서버에 연결할 수 없어요.", true)
            } finally {
                btnSave.isEnabled = true
            }
        }
    }
}