package com.enaboapps.switchify.remote.bridge

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.os.Bundle
import android.os.IBinder
import com.enaboapps.switchify.remotebridge.ISwitchifyRemoteBridge
import com.enaboapps.switchify.remotebridge.ISwitchifyRemoteBridgeCallback
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.delay

class SwitchifyAndroidBridgeModule : Module() {
    private var bridge: ISwitchifyRemoteBridge? = null
    private var binding = false
    private var bindRequested = false

    private val context: Context
        get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

    private val callback = object : ISwitchifyRemoteBridgeCallback.Stub() {
        override fun onSnapshot(snapshot: Bundle) {
            sendEvent("onBridgeEvent", snapshot.toEventMap("snapshot"))
        }

        override fun onRepeatStopRequested(generation: Long) {
            sendEvent("onBridgeEvent", mapOf("type" to "repeatStop", "generation" to generation.toDouble()))
        }

        override fun onSwitchEdge(
            generation: Long,
            sequence: Long,
            keyCode: Int,
            down: Boolean,
            downTimeMs: Long,
            eventTimeMs: Long,
            cancelled: Boolean
        ) {
            sendEvent(
                "onBridgeEvent",
                mapOf(
                    "type" to "switchEdge",
                    "generation" to generation.toDouble(),
                    "sequence" to sequence.toDouble(),
                    "keyCode" to keyCode,
                    "down" to down,
                    "downTimeMs" to downTimeMs.toDouble(),
                    "eventTimeMs" to eventTimeMs.toDouble(),
                    "cancelled" to cancelled
                )
            )
        }
    }

    private val connection = object : ServiceConnection {
        override fun onServiceConnected(name: ComponentName, binder: IBinder) {
            val service = ISwitchifyRemoteBridge.Stub.asInterface(binder)
            binding = false
            runCatching {
                check(service.version == SUPPORTED_BRIDGE_VERSION)
                service.registerCallback(callback)
                val snapshot = service.getSnapshot()
                bridge = service
                sendEvent("onBridgeEvent", snapshot.toEventMap("snapshot"))
            }.onFailure { disconnectInternal() }
        }

        override fun onServiceDisconnected(name: ComponentName) = disconnected(bindingEnded = false)
        override fun onBindingDied(name: ComponentName) = disconnected(bindingEnded = true)
        override fun onNullBinding(name: ComponentName) = disconnected(bindingEnded = true)
    }

    override fun definition() = ModuleDefinition {
        Name("SwitchifyAndroidBridge")
        Events("onBridgeEvent")

        AsyncFunction("connectAsync") Coroutine (suspend { connectAndAwait() })

        AsyncFunction("disconnectAsync") {
            disconnectInternal()
        }

        AsyncFunction("getVersionAsync") {
            runCatching { bridge?.version ?: 0 }.getOrDefault(0)
        }

        AsyncFunction("snapshotAsync") {
            bridge?.getSnapshot()?.toEventMap("snapshot") ?: unavailableSnapshot()
        }

        AsyncFunction("setRepeatActiveAsync") { generation: Double, active: Boolean ->
            runCatching { bridge?.setRepeatActive(generation.toLong(), active) == true }.getOrDefault(false)
        }

        AsyncFunction("setForwardingActiveAsync") { generation: Double, active: Boolean ->
            runCatching { bridge?.setForwardingActive(generation.toLong(), active) == true }.getOrDefault(false)
        }

        OnDestroy {
            disconnectInternal()
        }
    }

    private suspend fun connectAndAwait(): Boolean {
        if (bridge != null) return true
        if (!binding) {
            binding = true
            val intent = Intent(BRIDGE_ACTION).setComponent(
                ComponentName(SWITCHIFY_PACKAGE, SWITCHIFY_BRIDGE_SERVICE)
            )
            val started = runCatching { context.bindService(intent, connection, Context.BIND_AUTO_CREATE) }
                .getOrDefault(false)
            bindRequested = started
            if (!started) {
                binding = false
                sendEvent("onBridgeEvent", unavailableSnapshot())
                return false
            }
        }
        repeat(CONNECTION_WAIT_ATTEMPTS) {
            if (bridge != null) return true
            if (!binding) return false
            delay(CONNECTION_WAIT_INTERVAL_MS)
        }
        return bridge != null
    }

    private fun disconnectInternal() {
        val service = bridge
        bridge = null
        binding = false
        if (service != null) runCatching { service.unregisterCallback(callback) }
        if (bindRequested) runCatching { context.unbindService(connection) }
        bindRequested = false
    }

    private fun disconnected(bindingEnded: Boolean) {
        bridge = null
        binding = false
        if (bindingEnded && bindRequested) {
            runCatching { context.unbindService(connection) }
            bindRequested = false
        }
        sendEvent("onBridgeEvent", unavailableSnapshot())
    }

    private fun Bundle.toEventMap(type: String): Map<String, Any?> {
        val switches = getParcelableArrayList<Bundle>("externalSwitches").orEmpty().map { item ->
            mapOf(
                "keyCode" to item.getInt("keyCode"),
                "name" to item.getString("name").orEmpty()
            )
        }
        return mapOf(
            "type" to type,
            "version" to getInt("version", 0),
            "captureAvailable" to getBoolean("captureAvailable", false),
            "externalSwitches" to switches
        )
    }

    private fun unavailableSnapshot(): Map<String, Any?> = mapOf(
        "type" to "snapshot",
        "version" to 0,
        "captureAvailable" to false,
        "externalSwitches" to emptyList<Map<String, Any?>>()
    )

    private companion object {
        const val SWITCHIFY_PACKAGE = "com.enaboapps.switchify"
        const val SWITCHIFY_BRIDGE_SERVICE =
            "com.enaboapps.switchify.service.remotebridge.SwitchifyRemoteBridgeService"
        const val BRIDGE_ACTION = "com.enaboapps.switchify.remote.BIND_BRIDGE"
        const val SUPPORTED_BRIDGE_VERSION = 1
        const val CONNECTION_WAIT_ATTEMPTS = 30
        const val CONNECTION_WAIT_INTERVAL_MS = 100L
    }
}
