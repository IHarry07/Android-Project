package com.example.android_project.ui.expense

import android.content.Intent
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.example.android_project.R
import com.example.android_project.data.ExpenseRepository
import com.example.android_project.model.Balance
import com.example.android_project.model.Expense
import com.example.android_project.model.won
import com.example.android_project.ui.BaseActivity
import com.example.android_project.util.ApiError
import com.example.android_project.util.Msg
import com.google.gson.Gson
import kotlinx.coroutines.launch

/** 정산: 사람별로 받을/보낼 돈과 지출 내역. 지출을 누르면 상세, 위의 버튼으로 지출을 등록한다. */
class ExpenseActivity : BaseActivity() {

    companion object {
        const val EXTRA_ROOM_ID = "roomId"
    }

    private lateinit var repo: ExpenseRepository
    private lateinit var adapter: ExpenseAdapter
    private lateinit var tvToReceive: TextView
    private lateinit var tvToPay: TextView
    private lateinit var layoutBalances: ViewGroup
    private lateinit var tvEmpty: TextView
    private var roomId = 0
    private val gson = Gson()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_expense)

        roomId = intent.getIntExtra(EXTRA_ROOM_ID, 0)
        repo = ExpenseRepository(this)

        tvToReceive = findViewById(R.id.tvToReceive)
        tvToPay = findViewById(R.id.tvToPay)
        layoutBalances = findViewById(R.id.layoutBalances)
        tvEmpty = findViewById(R.id.tvExpenseEmpty)

        adapter = ExpenseAdapter { expense ->
            startActivity(
                Intent(this, ExpenseDetailActivity::class.java)
                    .putExtra(ExpenseDetailActivity.EXTRA_ROOM_ID, roomId)
                    .putExtra(ExpenseDetailActivity.EXTRA_EXPENSE_ID, expense.expenseId)
            )
        }
        findViewById<RecyclerView>(R.id.rvExpenses).apply {
            layoutManager = LinearLayoutManager(this@ExpenseActivity)
            adapter = this@ExpenseActivity.adapter
        }

        findViewById<View>(R.id.ivBack).setOnClickListener { finish() }
        findViewById<View>(R.id.btnAddExpense).setOnClickListener {
            startActivity(
                Intent(this, ExpenseFormActivity::class.java).putExtra(ExpenseFormActivity.EXTRA_ROOM_ID, roomId)
            )
        }
    }

    // 지출을 등록·수정·정산하고 돌아왔을 때 최신 상태로 보이도록 화면에 들어올 때마다 불러온다.
    override fun onResume() {
        super.onResume()
        load()
    }

    private fun load() {
        lifecycleScope.launch {
            try {
                val balances = repo.balances(roomId)
                if (balances != null && balances.isSuccessful) {
                    val body = balances.body()
                    tvToReceive.text = (body?.get("totalToReceive")?.asInt ?: 0).won()
                    tvToPay.text = (body?.get("totalToPay")?.asInt ?: 0).won()
                    val list = body?.getAsJsonArray("balances")?.map { gson.fromJson(it, Balance::class.java) }.orEmpty()
                    showBalances(list)
                }

                val response = repo.list(roomId) ?: return@launch
                if (response.isSuccessful) {
                    val list = response.body()?.getAsJsonArray("expenses")
                        ?.map { gson.fromJson(it, Expense::class.java) }.orEmpty()
                    adapter.submit(list)
                    tvEmpty.visibility = if (list.isEmpty()) View.VISIBLE else View.GONE
                } else {
                    Msg.show(this@ExpenseActivity, ApiError.messageOf(response, "지출 내역을 불러오지 못했어요."))
                }
            } catch (e: Exception) {
                Msg.show(this@ExpenseActivity, "서버에 연결할 수 없어요.")
            }
        }
    }

    private fun showBalances(list: List<Balance>) {
        layoutBalances.removeAllViews()
        for (b in list) {
            val row = LayoutInflater.from(this).inflate(R.layout.item_balance, layoutBalances, false)
            val name = b.user?.displayName() ?: "알 수 없음"
            val text = row.findViewById<TextView>(R.id.tvBalanceText)
            val amount = row.findViewById<TextView>(R.id.tvBalanceAmount)
            if (b.amount > 0) {
                text.text = "${name}님이 나에게 줄 돈"
                amount.text = "+${b.amount.won()}"
                amount.setTextColor(ContextCompat.getColor(this, R.color.rm_primary))
            } else {
                text.text = "${name}님에게 보낼 돈"
                amount.text = "-${(-b.amount).won()}"
                amount.setTextColor(ContextCompat.getColor(this, R.color.rm_title))
            }
            layoutBalances.addView(row)
        }
    }
}

private class ExpenseAdapter(
    private val onClick: (Expense) -> Unit
) : RecyclerView.Adapter<ExpenseAdapter.Holder>() {

    private val items = mutableListOf<Expense>()

    fun submit(list: List<Expense>) {
        items.clear()
        items.addAll(list)
        notifyDataSetChanged()
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int) =
        Holder(LayoutInflater.from(parent.context).inflate(R.layout.item_expense, parent, false))

    override fun onBindViewHolder(holder: Holder, position: Int) {
        val e = items[position]
        val ctx = holder.itemView.context
        holder.title.text = e.title
        holder.sub.text = "${e.expenseDate} · ${e.payer?.displayName() ?: "알 수 없음"} 결제"
        holder.amount.text = e.amount.won()
        holder.state.text = if (e.allSettled) "정산 완료" else "정산 중"
        holder.state.setTextColor(
            ContextCompat.getColor(ctx, if (e.allSettled) R.color.rm_kind_cleaning else R.color.rm_primary)
        )
        holder.itemView.setOnClickListener { onClick(e) }
    }

    override fun getItemCount() = items.size

    class Holder(view: View) : RecyclerView.ViewHolder(view) {
        val title: TextView = view.findViewById(R.id.tvExpenseTitle)
        val sub: TextView = view.findViewById(R.id.tvExpenseSub)
        val amount: TextView = view.findViewById(R.id.tvExpenseAmount)
        val state: TextView = view.findViewById(R.id.tvExpenseState)
    }
}