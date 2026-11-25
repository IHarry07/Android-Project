package com.example.android_project.ui.item

import android.app.DatePickerDialog
import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.ImageView
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.camera.core.ExperimentalGetImage
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.example.android_project.R
import com.example.android_project.data.ItemRepository
import com.example.android_project.model.CreateItemRequest
import com.example.android_project.util.ApiError
import com.google.gson.JsonObject
import kotlinx.coroutines.launch
import java.util.Calendar

// 물품 추가·수정. 창고에서는 종류를 고르고, 냉장고에서는 음식(FOOD)으로 고정된다.
class ItemFormActivity : com.example.android_project.ui.BaseActivity() {

    companion object {
        const val EXTRA_ROOM_ID = "roomId"
        const val EXTRA_OWNERSHIP = "ownershipType"   // SHARED / PERSONAL
        const val EXTRA_CATEGORY = "category"         // FOOD / SUPPLY / "" (직접 선택)

        // 수정할 때만 넘긴다. EXTRA_ITEM_ID가 있으면 수정 화면이 된다.
        const val EXTRA_ITEM_ID = "itemId"
        const val EXTRA_NAME = "name"
        const val EXTRA_QUANTITY = "quantity"
        const val EXTRA_UNIT = "unit"
        const val EXTRA_EXPIRY = "expiry"
        const val EXTRA_LOCATION = "location"
    }

    private lateinit var repo: ItemRepository

    private lateinit var etName: EditText
    private lateinit var etQuantity: EditText
    private lateinit var etUnit: EditText
    private lateinit var etLocation: EditText
    private lateinit var tvExpiry: TextView
    private lateinit var btnSave: Button

    private lateinit var tabShared: TextView
    private lateinit var tabPersonal: TextView
    private lateinit var tvOwnershipHint: TextView
    private lateinit var chipSupply: TextView
    private lateinit var chipFood: TextView
    private lateinit var cardQr: View
    private lateinit var tvQrTitle: TextView

    private var roomId = 0

    // 0이면 새 물품 추가, 아니면 그 물품 수정
    private var editItemId = 0

    // 화면에서 고른 값
    private var ownership = "SHARED"            // SHARED / PERSONAL
    private var category = "SUPPLY"             // SUPPLY / FOOD
    private var categoryFixed = false           // 냉장고에서 들어오면 FOOD로 고정

    // yyyy-MM-dd, 선택하지 않으면 null
    private var expiryDate: String? = null

    // QR을 읽고 돌아오면 서버에서 상품명을 조회해 이름 칸에 채운다.
    @OptIn(ExperimentalGetImage::class)
    private val scanLauncher =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            val qr = result.data?.getStringExtra(QrScanActivity.EXTRA_QR_VALUE)
            if (result.resultCode == RESULT_OK && qr != null) {
                lookupProduct(qr)
            }
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_item_form)

        roomId = intent.getIntExtra(EXTRA_ROOM_ID, 0)
        ownership = intent.getStringExtra(EXTRA_OWNERSHIP) ?: "SHARED"
        val fixed = intent.getStringExtra(EXTRA_CATEGORY).orEmpty()
        if (fixed.isNotEmpty()) {
            category = fixed
            categoryFixed = true
        }
        repo = ItemRepository(this)

        etName = findViewById(R.id.etItemName)
        etQuantity = findViewById(R.id.etItemQuantity)
        etUnit = findViewById(R.id.etItemUnit)
        etLocation = findViewById(R.id.etItemLocation)
        tvExpiry = findViewById(R.id.tvItemExpiry)
        btnSave = findViewById(R.id.btnSaveItem)
        tabShared = findViewById(R.id.tabShared)
        tabPersonal = findViewById(R.id.tabPersonal)
        tvOwnershipHint = findViewById(R.id.tvOwnershipHint)
        chipSupply = findViewById(R.id.chipSupply)
        chipFood = findViewById(R.id.chipFood)
        cardQr = findViewById(R.id.cardQr)
        tvQrTitle = findViewById(R.id.tvQrTitle)

        findViewById<ImageView>(R.id.ivBack).setOnClickListener { finish() }

        tabShared.setOnClickListener { ownership = "SHARED"; renderChoices() }
        tabPersonal.setOnClickListener { ownership = "PERSONAL"; renderChoices() }
        chipSupply.setOnClickListener { category = "SUPPLY"; renderChoices() }
        chipFood.setOnClickListener { category = "FOOD"; renderChoices() }

        cardQr.setOnClickListener {
            scanLauncher.launch(Intent(this, QrScanActivity::class.java))
        }

        editItemId = intent.getIntExtra(EXTRA_ITEM_ID, 0)
        if (editItemId > 0) {
            // 수정할 때는 공용/내 것·종류·QR 입력을 쓰지 않는다. (공용↔내 것은 목록의 '바꾸기'로)
            findViewById<View>(R.id.layoutOwnership).visibility = View.GONE
            tvOwnershipHint.visibility = View.GONE
            cardQr.visibility = View.GONE
            btnSave.text = "저장하기"

            etName.setText(intent.getStringExtra(EXTRA_NAME))
            val quantity = intent.getDoubleExtra(EXTRA_QUANTITY, 1.0)
            etQuantity.setText(
                if (quantity % 1.0 == 0.0) quantity.toLong().toString() else quantity.toString()
            )
            etUnit.setText(intent.getStringExtra(EXTRA_UNIT).orEmpty())
            etLocation.setText(intent.getStringExtra(EXTRA_LOCATION).orEmpty())
            expiryDate = intent.getStringExtra(EXTRA_EXPIRY)
        }

        tvExpiry.setOnClickListener { pickDate() }
        tvExpiry.setOnLongClickListener {
            expiryDate = null
            showExpiry()
            true
        }
        btnSave.setOnClickListener { save() }

        showExpiry()
        renderChoices()
    }

    // 공용/내 것 탭, 종류 칩, 제목을 현재 선택에 맞춰 다시 그린다.
    private fun renderChoices() {
        val primary = ContextCompat.getColor(this, R.color.rm_primary)
        val sub = ContextCompat.getColor(this, R.color.rm_sub)
        val white = ContextCompat.getColor(this, R.color.white)

        fun segment(tab: TextView, on: Boolean) {
            if (on) {
                tab.setBackgroundResource(R.drawable.bg_card_white_plain)
                tab.setTextColor(primary)
            } else {
                tab.background = null
                tab.setTextColor(sub)
            }
        }

        fun chip(chip: TextView, on: Boolean) {
            chip.setBackgroundResource(if (on) R.drawable.bg_chip_on else R.drawable.bg_chip_off)
            chip.setTextColor(if (on) white else sub)
        }

        segment(tabShared, ownership == "SHARED")
        segment(tabPersonal, ownership == "PERSONAL")
        tvOwnershipHint.text =
            if (ownership == "SHARED") "방 구성원 모두가 함께 쓰는 물품이에요."
            else "나만 쓰는 물품이에요. 다른 구성원은 볼 수만 있고 수정할 수 없어요."

        chip(chipSupply, category == "SUPPLY")
        chip(chipFood, category == "FOOD")
        findViewById<View>(R.id.layoutCategory).visibility =
            if (categoryFixed || editItemId > 0) View.GONE else View.VISIBLE

        findViewById<TextView>(R.id.tvFormTitle).text = when {
            editItemId > 0 -> if (category == "FOOD") "음식 수정" else "물품 수정"
            category == "FOOD" -> "음식 추가"
            else -> "물품 추가"
        }
    }

    private fun lookupProduct(qr: String) {
        cardQr.isEnabled = false
        tvQrTitle.text = "상품명 조회 중..."

        lifecycleScope.launch {
            try {
                val response = repo.lookupProduct(qr)

                when {
                    response == null ->
                        toast("로그인이 필요합니다.")
                    response.isSuccessful -> {
                        val name = response.body()?.get("productName")
                            ?.takeIf { it.isJsonPrimitive }?.asString
                        if (name.isNullOrBlank()) {
                            toast("상품명을 찾지 못했어요. 직접 입력해 주세요.", long = true)
                        } else {
                            etName.setText(name)
                            toast("상품명을 가져왔어요.")
                        }
                    }
                    else -> toast(ApiError.messageOf(response, "상품 정보를 가져오지 못했어요."), long = true)
                }
            } catch (e: Exception) {
                toast("서버에 연결할 수 없습니다.\n(${e.message})", long = true)
            } finally {
                cardQr.isEnabled = true
                tvQrTitle.text = "QR 코드로 입력"
            }
        }
    }

    private fun pickDate() {
        val cal = Calendar.getInstance()
        DatePickerDialog(
            this,
            { _, year, month, day ->
                expiryDate = "%04d-%02d-%02d".format(year, month + 1, day)
                showExpiry()
            },
            cal.get(Calendar.YEAR),
            cal.get(Calendar.MONTH),
            cal.get(Calendar.DAY_OF_MONTH)
        ).show()
    }

    private fun showExpiry() {
        val date = expiryDate
        if (date == null) {
            tvExpiry.text = "날짜 선택"
            tvExpiry.setTextColor(ContextCompat.getColor(this, R.color.rm_hint))
        } else {
            tvExpiry.text = "$date  (길게 누르면 지워져요)"
            tvExpiry.setTextColor(ContextCompat.getColor(this, R.color.rm_title))
        }
    }

    private fun save() {
        val name = etName.text.toString().trim()
        val quantity = etQuantity.text.toString().trim().toDoubleOrNull()

        if (name.isEmpty()) {
            etName.error = "이름을 입력해 주세요."
            return
        }
        if (quantity == null || quantity < 0) {
            etQuantity.error = "수량을 숫자로 입력해 주세요."
            return
        }

        if (editItemId > 0) {
            saveEdit(name, quantity)
            return
        }

        val request = CreateItemRequest(
            name = name,
            category = category,
            ownershipType = ownership,
            quantity = quantity,
            unit = etUnit.text.toString().trim().ifEmpty { null },
            expiryDate = expiryDate,
            storageLocation = etLocation.text.toString().trim().ifEmpty { null }
        )

        submit("추가했어요.", "추가하지 못했어요.") { repo.create(roomId, request) }
    }

    // 수정: 비운 칸은 서버에 null로 보내 값을 지운다.
    private fun saveEdit(name: String, quantity: Double) {
        val changes = JsonObject().apply {
            addProperty("name", name)
            addProperty("quantity", quantity)
            addProperty("unit", etUnit.text.toString().trim().ifEmpty { null })
            addProperty("expiryDate", expiryDate)
            addProperty("storageLocation", etLocation.text.toString().trim().ifEmpty { null })
        }

        submit("저장했어요.", "저장하지 못했어요.") { repo.update(roomId, editItemId, changes) }
    }

    // 서버에 보내고, 성공하면 화면을 닫는다.
    private fun submit(
        successMessage: String,
        failMessage: String,
        request: suspend () -> retrofit2.Response<*>?
    ) {
        btnSave.isEnabled = false

        lifecycleScope.launch {
            try {
                val response = request()

                when {
                    response == null -> toast("로그인이 필요합니다.")
                    response.isSuccessful -> {
                        toast(successMessage)
                        finish()
                    }
                    else -> toast(ApiError.messageOf(response, failMessage), long = true)
                }
            } catch (e: Exception) {
                toast("서버에 연결할 수 없습니다.\n(${e.message})", long = true)
            } finally {
                btnSave.isEnabled = true
            }
        }
    }

    private fun toast(message: String, long: Boolean = false) {
        com.example.android_project.util.Msg.makeText(this, message, if (long) Toast.LENGTH_LONG else Toast.LENGTH_SHORT).show()
    }
}
