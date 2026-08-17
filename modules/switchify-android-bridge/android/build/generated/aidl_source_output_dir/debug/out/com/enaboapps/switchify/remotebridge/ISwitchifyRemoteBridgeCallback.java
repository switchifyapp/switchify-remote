/*
 * This file is auto-generated.  DO NOT MODIFY.
 * Using: C:\Users\oamcg\AppData\Local\Android\Sdk\build-tools\35.0.0\aidl.exe -pC:\Users\oamcg\AppData\Local\Android\Sdk\platforms\android-36\framework.aidl -oC:\Users\oamcg\source\repos\switchify-remote\modules\switchify-android-bridge\android\build\generated\aidl_source_output_dir\debug\out -IC:\Users\oamcg\source\repos\switchify-remote\modules\switchify-android-bridge\android\src\main\aidl -IC:\Users\oamcg\source\repos\switchify-remote\modules\switchify-android-bridge\android\src\debug\aidl -IC:\Users\oamcg\.gradle\caches\9.3.1\transforms\156353825c9adee839ad0f2ae695a654\workspace\transformed\core-1.17.0\aidl -IC:\Users\oamcg\.gradle\caches\9.3.1\transforms\e212b54a326ca8384d524595fdb7fd20\workspace\transformed\versionedparcelable-1.1.1\aidl -dC:\Users\oamcg\AppData\Local\Temp\aidl1509626378507827701.d C:\Users\oamcg\source\repos\switchify-remote\modules\switchify-android-bridge\android\src\main\aidl\com\enaboapps\switchify\remotebridge\ISwitchifyRemoteBridgeCallback.aidl
 */
package com.enaboapps.switchify.remotebridge;
public interface ISwitchifyRemoteBridgeCallback extends android.os.IInterface
{
  /** Default implementation for ISwitchifyRemoteBridgeCallback. */
  public static class Default implements com.enaboapps.switchify.remotebridge.ISwitchifyRemoteBridgeCallback
  {
    @Override public void onSnapshot(android.os.Bundle snapshot) throws android.os.RemoteException
    {
    }
    @Override public void onRepeatStopRequested(long generation) throws android.os.RemoteException
    {
    }
    @Override public void onSwitchEdge(long generation, long sequence, int keyCode, boolean down, long downTimeMs, long eventTimeMs, boolean cancelled) throws android.os.RemoteException
    {
    }
    @Override
    public android.os.IBinder asBinder() {
      return null;
    }
  }
  /** Local-side IPC implementation stub class. */
  public static abstract class Stub extends android.os.Binder implements com.enaboapps.switchify.remotebridge.ISwitchifyRemoteBridgeCallback
  {
    /** Construct the stub at attach it to the interface. */
    @SuppressWarnings("this-escape")
    public Stub()
    {
      this.attachInterface(this, DESCRIPTOR);
    }
    /**
     * Cast an IBinder object into an com.enaboapps.switchify.remotebridge.ISwitchifyRemoteBridgeCallback interface,
     * generating a proxy if needed.
     */
    public static com.enaboapps.switchify.remotebridge.ISwitchifyRemoteBridgeCallback asInterface(android.os.IBinder obj)
    {
      if ((obj==null)) {
        return null;
      }
      android.os.IInterface iin = obj.queryLocalInterface(DESCRIPTOR);
      if (((iin!=null)&&(iin instanceof com.enaboapps.switchify.remotebridge.ISwitchifyRemoteBridgeCallback))) {
        return ((com.enaboapps.switchify.remotebridge.ISwitchifyRemoteBridgeCallback)iin);
      }
      return new com.enaboapps.switchify.remotebridge.ISwitchifyRemoteBridgeCallback.Stub.Proxy(obj);
    }
    @Override public android.os.IBinder asBinder()
    {
      return this;
    }
    @Override public boolean onTransact(int code, android.os.Parcel data, android.os.Parcel reply, int flags) throws android.os.RemoteException
    {
      java.lang.String descriptor = DESCRIPTOR;
      if (code >= android.os.IBinder.FIRST_CALL_TRANSACTION && code <= android.os.IBinder.LAST_CALL_TRANSACTION) {
        data.enforceInterface(descriptor);
      }
      if (code == INTERFACE_TRANSACTION) {
        reply.writeString(descriptor);
        return true;
      }
      switch (code)
      {
        case TRANSACTION_onSnapshot:
        {
          android.os.Bundle _arg0;
          _arg0 = _Parcel.readTypedObject(data, android.os.Bundle.CREATOR);
          this.onSnapshot(_arg0);
          break;
        }
        case TRANSACTION_onRepeatStopRequested:
        {
          long _arg0;
          _arg0 = data.readLong();
          this.onRepeatStopRequested(_arg0);
          break;
        }
        case TRANSACTION_onSwitchEdge:
        {
          long _arg0;
          _arg0 = data.readLong();
          long _arg1;
          _arg1 = data.readLong();
          int _arg2;
          _arg2 = data.readInt();
          boolean _arg3;
          _arg3 = (0!=data.readInt());
          long _arg4;
          _arg4 = data.readLong();
          long _arg5;
          _arg5 = data.readLong();
          boolean _arg6;
          _arg6 = (0!=data.readInt());
          this.onSwitchEdge(_arg0, _arg1, _arg2, _arg3, _arg4, _arg5, _arg6);
          break;
        }
        default:
        {
          return super.onTransact(code, data, reply, flags);
        }
      }
      return true;
    }
    private static class Proxy implements com.enaboapps.switchify.remotebridge.ISwitchifyRemoteBridgeCallback
    {
      private android.os.IBinder mRemote;
      Proxy(android.os.IBinder remote)
      {
        mRemote = remote;
      }
      @Override public android.os.IBinder asBinder()
      {
        return mRemote;
      }
      public java.lang.String getInterfaceDescriptor()
      {
        return DESCRIPTOR;
      }
      @Override public void onSnapshot(android.os.Bundle snapshot) throws android.os.RemoteException
      {
        android.os.Parcel _data = android.os.Parcel.obtain();
        try {
          _data.writeInterfaceToken(DESCRIPTOR);
          _Parcel.writeTypedObject(_data, snapshot, 0);
          boolean _status = mRemote.transact(Stub.TRANSACTION_onSnapshot, _data, null, android.os.IBinder.FLAG_ONEWAY);
        }
        finally {
          _data.recycle();
        }
      }
      @Override public void onRepeatStopRequested(long generation) throws android.os.RemoteException
      {
        android.os.Parcel _data = android.os.Parcel.obtain();
        try {
          _data.writeInterfaceToken(DESCRIPTOR);
          _data.writeLong(generation);
          boolean _status = mRemote.transact(Stub.TRANSACTION_onRepeatStopRequested, _data, null, android.os.IBinder.FLAG_ONEWAY);
        }
        finally {
          _data.recycle();
        }
      }
      @Override public void onSwitchEdge(long generation, long sequence, int keyCode, boolean down, long downTimeMs, long eventTimeMs, boolean cancelled) throws android.os.RemoteException
      {
        android.os.Parcel _data = android.os.Parcel.obtain();
        try {
          _data.writeInterfaceToken(DESCRIPTOR);
          _data.writeLong(generation);
          _data.writeLong(sequence);
          _data.writeInt(keyCode);
          _data.writeInt(((down)?(1):(0)));
          _data.writeLong(downTimeMs);
          _data.writeLong(eventTimeMs);
          _data.writeInt(((cancelled)?(1):(0)));
          boolean _status = mRemote.transact(Stub.TRANSACTION_onSwitchEdge, _data, null, android.os.IBinder.FLAG_ONEWAY);
        }
        finally {
          _data.recycle();
        }
      }
    }
    static final int TRANSACTION_onSnapshot = (android.os.IBinder.FIRST_CALL_TRANSACTION + 0);
    static final int TRANSACTION_onRepeatStopRequested = (android.os.IBinder.FIRST_CALL_TRANSACTION + 1);
    static final int TRANSACTION_onSwitchEdge = (android.os.IBinder.FIRST_CALL_TRANSACTION + 2);
  }
  /** @hide */
  public static final java.lang.String DESCRIPTOR = "com.enaboapps.switchify.remotebridge.ISwitchifyRemoteBridgeCallback";
  public void onSnapshot(android.os.Bundle snapshot) throws android.os.RemoteException;
  public void onRepeatStopRequested(long generation) throws android.os.RemoteException;
  public void onSwitchEdge(long generation, long sequence, int keyCode, boolean down, long downTimeMs, long eventTimeMs, boolean cancelled) throws android.os.RemoteException;
  /** @hide */
  static class _Parcel {
    static private <T> T readTypedObject(
        android.os.Parcel parcel,
        android.os.Parcelable.Creator<T> c) {
      if (parcel.readInt() != 0) {
          return c.createFromParcel(parcel);
      } else {
          return null;
      }
    }
    static private <T extends android.os.Parcelable> void writeTypedObject(
        android.os.Parcel parcel, T value, int parcelableFlags) {
      if (value != null) {
        parcel.writeInt(1);
        value.writeToParcel(parcel, parcelableFlags);
      } else {
        parcel.writeInt(0);
      }
    }
  }
}
