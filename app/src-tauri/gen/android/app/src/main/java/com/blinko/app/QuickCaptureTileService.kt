package com.blinko.app

import android.annotation.SuppressLint
import android.app.PendingIntent
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService

class QuickCaptureTileService : TileService() {

    override fun onStartListening() {
        super.onStartListening()
        qsTile?.apply {
            label = getString(R.string.quick_capture_tile_label)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                subtitle = getString(R.string.quick_capture_tile_subtitle)
            }
            state = Tile.STATE_ACTIVE
            updateTile()
        }
    }

    @SuppressLint("StartActivityAndCollapseDeprecated")
    override fun onClick() {
        super.onClick()
        unlockAndRun {
            launchQuickCapture()
        }
    }

    private fun launchQuickCapture() {
        val intent = Intent(Intent.ACTION_VIEW).apply {
            data = Uri.parse(QUICK_CAPTURE_URI)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            setClassName(packageName, "$packageName.MainActivity")
        }

        val pendingIntent = PendingIntent.getActivity(
            this,
            QUICK_CAPTURE_REQUEST_CODE,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        if (Build.VERSION.SDK_INT >= 34) {
            startActivityAndCollapse(pendingIntent)
        } else {
            @Suppress("DEPRECATION")
            startActivityAndCollapse(intent)
        }
    }

    companion object {
        private const val QUICK_CAPTURE_URI = "blinko://shortcut/quick_capture"
        private const val QUICK_CAPTURE_REQUEST_CODE = 4101
    }
}
