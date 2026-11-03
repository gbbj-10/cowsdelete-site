// Mucca CAD: DXF text -> DWG bytes via acadrust (MPL-2.0)
use acadrust::{DxfReader, DwgWriter};
use std::io::Cursor;
static mut OUT: Vec<u8> = Vec::new();
static mut ERR: Vec<u8> = Vec::new();
static mut COUNT: usize = 0;
#[no_mangle] pub extern "C" fn mdwg_alloc(n: usize) -> *mut u8 { let mut v = Vec::<u8>::with_capacity(n); let p = v.as_mut_ptr(); std::mem::forget(v); p }
#[no_mangle] pub extern "C" fn mdwg_free(p: *mut u8, n: usize) { unsafe { drop(Vec::from_raw_parts(p, 0, n)); } }
pub fn convert(dxf: &[u8], ver: i32) -> Result<Vec<u8>, String> {
    let mut doc = DxfReader::from_reader(Cursor::new(dxf.to_vec())).map_err(|e| e.to_string())?.read().map_err(|e| e.to_string())?;
    doc.version = match ver { 2004 => acadrust::types::DxfVersion::AC1018, 2010 => acadrust::types::DxfVersion::AC1024, 2013 => acadrust::types::DxfVersion::AC1027, 2018 => acadrust::types::DxfVersion::AC1032, _ => acadrust::types::DxfVersion::AC1015 };
    DwgWriter::write_to_vec(&doc).map_err(|e| e.to_string())
}
/// returns 0 ok (bytes in out), 1 error (message in err)
#[no_mangle] pub extern "C" fn mdwg_convert(p: *const u8, n: usize, ver: i32) -> i32 {
    let input = unsafe { std::slice::from_raw_parts(p, n) };
    unsafe { match convert(input, ver) { Ok(v) => { OUT = v; 0 } Err(e) => { ERR = e.into_bytes(); 1 } } }
}
#[no_mangle] pub extern "C" fn mdwg_out_ptr() -> *const u8 { unsafe { (*std::ptr::addr_of!(OUT)).as_ptr() } }
#[no_mangle] pub extern "C" fn mdwg_out_len() -> usize { unsafe { (*std::ptr::addr_of!(OUT)).len() } }
#[no_mangle] pub extern "C" fn mdwg_err_ptr() -> *const u8 { unsafe { (*std::ptr::addr_of!(ERR)).as_ptr() } }
#[no_mangle] pub extern "C" fn mdwg_err_len() -> usize { unsafe { (*std::ptr::addr_of!(ERR)).len() } }
/// DWG bytes -> ASCII DXF (same version as the file). failsafe=1 keeps going past broken objects.
pub fn dwg_to_dxf(dwg: &[u8], failsafe: bool) -> Result<Vec<u8>, String> {
    let mut o = acadrust::DwgReadOptions::default();
    o.failsafe = failsafe;
    let mut r = acadrust::DwgReader::from_stream_with_options(Cursor::new(dwg.to_vec()), o);
    let doc = r.read().map_err(|e| e.to_string())?;
    unsafe { COUNT = doc.entities().count(); }
    acadrust::DxfWriter::new(&doc).write_to_vec().map_err(|e| e.to_string())
}
#[no_mangle] pub extern "C" fn mdwg_to_dxf(p: *const u8, n: usize, failsafe: i32) -> i32 {
    let input = unsafe { std::slice::from_raw_parts(p, n) };
    unsafe { match dwg_to_dxf(input, failsafe != 0) { Ok(v) => { OUT = v; 0 } Err(e) => { ERR = e.into_bytes(); 1 } } }
}
#[no_mangle] pub extern "C" fn mdwg_clear() { unsafe { OUT = Vec::new(); ERR = Vec::new(); } }
/// entities in model+paper space of the last DWG read (0 = nothing readable)
#[no_mangle] pub extern "C" fn mdwg_count() -> usize { unsafe { COUNT } }
