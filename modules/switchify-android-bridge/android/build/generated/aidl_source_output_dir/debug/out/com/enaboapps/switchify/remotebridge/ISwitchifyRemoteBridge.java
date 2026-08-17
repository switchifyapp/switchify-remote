/*
 * This file is auto-generated.  DO NOT MODIFY.
 * Using: C:\Users\oamcg\AppData\Local\Android\Sdk\build-tools\35.0.0\aidl.exe -pC:\Users\oamcg\AppData\Local\Android\Sdk\platforms\android-36\framework.aidl -oC:\Users\oamcg\source\repos\switchify-remote\modules\switchify-android-bridge\android\build\generated\aidl_source_output_dir\debug\out -IC:\Users\oamcg\source\repos\switchify-remote\modules\switchify-android-bridge\android\src\main\aidl -IC:\Users\oamcg\source\repos\switchify-remote\modules\switchify-android-bridge\android\src\debug\aidl -IC:\Users\oamcg\.gradle\caches\9.3.1\transforms\156353825c9adee839ad0f2ae695a654\workspace\transformed\core-1.17.0\aidl -IC:\Users\oamcg\.gradle\caches\9.3.1\transforms\e212b54a326ca8384d524595fdb7fd20\workspace\transformed\versionedparcelable-1.1.1\aidl -dC:\Users\oamcg\AppData\Local\Temp\aidl5460087799095043377.d C:\Users\oamcg\source\repos\switchify-remote\modules\switchify-android-bridge\android\src\main\aidl\com\enaboapps\switchify\remotebridge\ISwitchifyRemoteBridge.aidl
 */
package com.enaboapps.switchify.remotebridge;
public interface ISwitchifyRemoteBridge extends android.os.IInterface
{
  /** Default implementation for ISwitchifyRemoteBridge. */
  public static class Default implements com.enaboapps.switchify.remotebridge.ISwitchifyRemoteBridge
  {
    @Override public int getVersion() throws android.os.RemoteException
    {
      return 0;
    }
    @Override public android.os.Bundle getSnapshot() throws android.os.RemoteException
    {
      return null;
    }
    @Override public void registerCallback(com.enaboapps.switchify.remotebridge.ISwitchifyRemoteBridgeCallback callback) throws android.os.RemoteException
    {
    }
    @Override public void unregisterCallback(com.enaboapps.switchify.remotebridge.ISwitchifyRemoteBridgeCallback callback) throws android.os.RemoteException
    {
    }
    @Override public boolean setRepeatActive(long generation, boolean active) throws android.os.RemoteException
    {
      return false;
    }
    @Override public boolean setForwardingActive(long generation, boolean active) throws android.os.RemoteException
    {
      return false;
    }
    @Override
    public android.os.IBinder asBinder() {
      return null;
    }
  }
  /** Local-side IPC implementation stub class. */
  public static abstract class Stub extends android.os.Binder implements com.enaboapps.switchify.remotebridge.ISwitchifyRemoteBridge
  {
    /** Construct the stub at attach it to the interface. */
    @SuppressWarnings("this-escape")
    public Stub()
    {
      this.attachInterface(this, DESCRIPTOR);
    }
    /**
     * Cast an IBinder object into an com.enaboapps.switchify.remotebridge.ISwitchifyRemoteBridge interface,
     * generating a proxy if needed.
     */
    public static com.enaboapps.switchify.remotebridge.ISwitchifyRemoteBridge asInterface(android.os.IBinder obj)
    {
      if ((obj==null)) {
        return null;
      }
      android.os.IInterface iin = obj.queryLocalInterface(DESCRIPTOR);
      if (((iin!=null)&&(iin instanceof com.enaboapps.switchify.remotebridge.ISwitchifyRemoteBridge))) {
        return ((com.enaboapps.switchify.remotebridge.ISwitchifyRemoteBridge)iin);
      }
      return new com.enaboapps.switchify.remotebridge.ISwitchifyRemoteBridge.Stub.Proxy(obj);
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
        case TRANSACTION_getVersion:
        {
          int _result = this.getVersion();
          reply.writeNoException();
          reply.writeInt(_result);
          break;
        }
        case TRANSACTION_getSnapshot:
        {
          android.os.Bundle _result = this.getSnapshot();
          reply.writeNoException();
          _Parcel.writeTypedObject(reply, _result, android.os.Parcelable.PARCELABLE_WRITE_RETURN_VALUE);
          break;
        }
        case TRANSACTION_registerCallback:
        {
          com.enaboapps.switchify.remotebridge.ISwitchifyRemoteBridgeCallback _arg0;
          _arg0 = com.enaboapps.switchify.remotebridge.ISwitchifyRemoteBridgeCallback.Stub.asInterface(data.readStrongBinder());
          this.registerCallback(_arg0);
          reply.writeNoException();
          break;
        }
        case TRANSACTION_unregisterCallback:
        {
          com.enaboapps.switchify.remotebridge.ISwitchifyRemoteBridgeCallback _arg0;
          _arg0 = com.enaboapps.switchify.remotebridge.ISwitchifyRemoteBridgeCallback.Stub.asInterface(data.readStrongBinder());
          this.unregisterCallback(_arg0);
          reply.writeNoException();
          break;
        }
        case TRANSACTION_setRepeatActive:
        {
          long _arg0;
          _arg0 = data.readLong();
          boolean _arg1;
          _arg1 = (0!=data.readInt());
          boolean _result = this.setRepeatActive(_arg0, _arg1);
          reply.writeNoException();
          reply.writeInt(((_result)?(1):(0)));
          break;
        }
        case TRANSACTION_setForwardingActive:
        {
          long _arg0;
          _arg0 = data.readLong();
          boolean _arg1;
          _arg1 = (0!=data.readInt());
          boolean _result = this.setForwardingActive(_arg0, _arg1);
          reply.writeNoException();
          reply.writeInt(((_result)?(1):(0)));
          break;
        }
        default:
        {
          return super.onTransact(code, data, reply, flags);
        }
      }
      return true;
    }
    private static class Proxy implements com.enaboapps.switchify.remotebridge.ISwitchifyRemoteBridge
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
      @Override public int getVersion() throws android.os.RemoteException
      {
        android.os.Parcel _data = android.os.Parcel.obtain();
        android.os.Parcel _reply = android.os.Parcel.obtain();
        int _result;
        try {
          _data.writeInterfaceToken(DESCRIPTOR);
          boolean _status = mRemote.transact(Stub.TRANSACTION_getVersion, _data, _reply, 0);
          _reply.readException();
          _result = _reply.readInt();
        }
        finally {
          _reply.recycle();
          _data.recycle();
        }
        return _result;
      }
      @Override public android.os.Bundle getSnapshot() throws android.os.RemoteException
      {
        android.os.Parcel _data = android.os.Parcel.obtain();
        android.os.Parcel _reply = android.os.Parcel.obtain();
        android.os.Bundle _result;
        try {
          _data.writeInterfaceToken(DESCRIPTOR);
          boolean _status = mRemote.transact(Stub.TRANSACTION_getSnapshot, _data, _reply, 0);
          _reply.readException();
          _result = _Parcel.readTypedObject(_reply, android.os.Bundle.CREATOR);
        }
        finally {
          _reply.recycle();
          _data.recycle();
        }
        return _result;
      }
      @Override public void registerCallback(com.enaboapps.switchify.remotebridge.ISwitchifyRemoteBridgeCallback callback) throws android.os.RemoteException
      {
        android.os.Parcel _data = android.os.Parcel.obtain();
        android.os.Parcel _reply = android.os.Parcel.obtain();
        try {
          _data.writeInterfaceToken(DESCRIPTOR);
          _data.writeStrongInterface(callback);
          boolean _status = mRemote.transact(Stub.TRANSACTION_registerCallback, _data, _reply, 0);
          _reply.readException();
        }
        finally {
          _reply.recycle();
          _data.recycle();
        }
      }
      @Override public void unregisterCallback(com.enaboapps.switchify.remotebridge.ISwitchifyRemoteBridgeCallback callback) throws android.os.RemoteException
      {
        android.os.Parcel _data = android.os.Parcel.obtain();
        android.os.Parcel _reply = android.os.Parcel.obtain();
        try {
          _data.writeInterfaceToken(DESCRIPTOR);
          _data.writeStrongInterface(callback);
          boolean _status = mRemote.transact(Stub.TRANSACTION_unregisterCallback, _data, _reply, 0);
          _reply.readException();
        }
        finally {
          _reply.recycle();
          _data.recycle();
        }
      }
      @Override public boolean setRepeatActive(long generation, boolean active) throws android.os.RemoteException
      {
        android.os.Parcel _data = android.os.Parcel.obtain();
        android.os.Parcel _reply = android.os.Parcel.obtain();
        boolean _result;
        try {
          _data.writeInterfaceToken(DESCRIPTOR);
          _data.writeLong(generation);
          _data.writeInt(((active)?(1):(0)));
          boolean _status = mRemote.transact(Stub.TRANSACTION_setRepeatActive, _data, _reply, 0);
          _reply.readException();
          _result = (0!=_reply.readInt());
        }
        finally {
          _reply.recycle();
          _data.recycle();
        }
        return _result;
      }
      @Override public boolean setForwardingActive(long generation, boolean active) throws android.os.RemoteException
      {
        android.os.Parcel _data = android.os.Parcel.obtain();
        android.os.Parcel _reply = android.os.Parcel.obtain();
        boolean _result;
        try {
          _data.writeInterfaceToken(DESCRIPTOR);
          _data.writeLong(generation);
          _data.writeInt(((active)?(1):(0)));
          boolean _status = mRemote.transact(Stub.TRANSACTION_setForwardingActive, _data, _reply, 0);
          _reply.readException();
          _result = (0!=_reply.readInt());
        }
        finally {
          _reply.recycle();
          _data.recycle();
        }
        return _result;
      }
    }
    static final int TRANSACTION_getVersion = (android.os.IBinder.FIRST_CALL_TRANSACTION + 0);
    static final int TRANSACTION_getSnapshot = (android.os.IBinder.FIRST_CALL_TRANSACTION + 1);
    static final int TRANSACTION_registerCallback = (android.os.IBinder.FIRST_CALL_TRANSACTION + 2);
    static final int TRANSACTION_unregisterCallback = (android.os.IBinder.FIRST_CALL_TRANSACTION + 3);
    static final int TRANSACTION_setRepeatActive = (android.os.IBinder.FIRST_CALL_TRANSACTION + 4);
    static final int TRANSACTION_setForwardingActive = (android.os.IBinder.FIRST_CALL_TRANSACTION + 5);
  }
  /** @hide */
  public static final java.lang.String DESCRIPTOR = "com.enaboapps.switchify.remotebridge.ISwitchifyRemoteBridge";
  public int getVersion() throws android.os.RemoteException;
  public android.os.Bundle getSnapshot() throws android.os.RemoteException;
  public void registerCallback(com.enaboapps.switchify.remotebridge.ISwitchifyRemoteBridgeCallback callback) throws android.os.RemoteException;
  public void unregisterCallback(com.enaboapps.switchify.remotebridge.ISwitchifyRemoteBridgeCallback callback) throws android.os.RemoteException;
  public boolean setRepeatActive(long generation, boolean active) throws android.os.RemoteException;
  public boolean setForwardingActive(long generation, boolean active) throws android.os.RemoteException;
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
