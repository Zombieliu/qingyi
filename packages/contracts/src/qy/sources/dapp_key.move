/// Dubhe 表授权用的 DappKey / Dapp key type used for Dubhe table authorization.
module qy::dapp_key {
  use std::type_name;
  use sui::address;
  use std::ascii::String;

  public struct DappKey has copy, drop {}

  public(package) fun new(): DappKey {
    DappKey {}
  }

  public fun to_string(): String {
    type_name::get<DappKey>().into_string()
  }

  public fun package_id(): address {
    let package_id_str = type_name::get<DappKey>().get_address();
    address::from_ascii_bytes(package_id_str.as_bytes())
  }

  public fun eq<D1: copy + drop, D2: copy + drop>(_: &D1, _: &D2): bool {
    type_name::get<D1>() == type_name::get<D2>()
  }
}
