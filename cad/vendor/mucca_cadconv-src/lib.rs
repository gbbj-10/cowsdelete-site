// Mucca CAD: native CAD bytes -> STEP bytes via cadmpeg (Apache-2.0), unmodified library crates.
use std::io::Cursor;
use cadmpeg_ir::codec::write::{target::TargetRequest, EncodeInput};
use cadmpeg_ir::codec::DecodeOptions;
use cadmpeg_registry::{build_encoder, Format, InputCatalog};

static mut OUT: Vec<u8> = Vec::new();
static mut MSG: Vec<u8> = Vec::new();

pub fn convert(bytes: &[u8], ext: &str) -> Result<(Vec<u8>, String), String> {
    let ext = ext.trim_start_matches('.').to_ascii_lowercase();
    let cat = InputCatalog::with_builtins();
    let enc = build_encoder(Format::Step);
    let mut tried = Vec::new();
    for d in cat.descriptors() {
        if !d.extensions().iter().any(|e| e.trim_start_matches('.').eq_ignore_ascii_case(&ext)) { continue; }
        let Some(codec) = d.codec() else { continue };
        let mut opts = DecodeOptions::default();
        opts.depth = enc.needs().request();
        match codec.decode(&mut Cursor::new(bytes.to_vec()), &opts) {
            Ok(res) => {
                let ir = res.ir();
                let faces = ir.model.faces.len();
                let bodies = ir.model.bodies.len();
                let losses = res.report().losses.len();
                let plan = enc.plan(EncodeInput::new(ir, None), TargetRequest::Inherit).map_err(|e| format!("STEP 만들기 실패: {e}"))?;
                let export_losses = plan.report().losses.len();
                let mut out = Vec::new();
                plan.write_to(&mut out).map_err(|e| format!("STEP 쓰기 실패: {e}"))?;
                let info = format!("{{\"format\":\"{}\",\"bodies\":{bodies},\"faces\":{faces},\"decode_losses\":{losses},\"export_losses\":{export_losses}}}", codec.id().as_str());
                return Ok((out, info));
            }
            Err(e) => tried.push(format!("{}: {e}", codec.id().as_str())),
        }
    }
    if tried.is_empty() { Err(format!("'{ext}' 형식을 읽는 변환기가 없습니다")) } else { Err(tried.join(" / ")) }
}

#[no_mangle] pub extern "C" fn mcc_alloc(n: usize) -> *mut u8 { let mut v = Vec::<u8>::with_capacity(n); let p = v.as_mut_ptr(); std::mem::forget(v); p }
#[no_mangle] pub extern "C" fn mcc_free(p: *mut u8, n: usize) { unsafe { drop(Vec::from_raw_parts(p, 0, n)); } }
/// ext: pointer/len of the file extension (utf-8). returns 0 ok (STEP in out, info json in msg), 1 error (msg)
#[no_mangle] pub extern "C" fn mcc_to_step(p: *const u8, n: usize, ep: *const u8, en: usize) -> i32 {
    let input = unsafe { std::slice::from_raw_parts(p, n) };
    let ext = unsafe { std::str::from_utf8(std::slice::from_raw_parts(ep, en)).unwrap_or("") };
    unsafe { match convert(input, ext) { Ok((o, i)) => { OUT = o; MSG = i.into_bytes(); 0 } Err(e) => { OUT = Vec::new(); MSG = e.into_bytes(); 1 } } }
}
#[no_mangle] pub extern "C" fn mcc_out_ptr() -> *const u8 { unsafe { (*std::ptr::addr_of!(OUT)).as_ptr() } }
#[no_mangle] pub extern "C" fn mcc_out_len() -> usize { unsafe { (*std::ptr::addr_of!(OUT)).len() } }
#[no_mangle] pub extern "C" fn mcc_msg_ptr() -> *const u8 { unsafe { (*std::ptr::addr_of!(MSG)).as_ptr() } }
#[no_mangle] pub extern "C" fn mcc_msg_len() -> usize { unsafe { (*std::ptr::addr_of!(MSG)).len() } }
#[no_mangle] pub extern "C" fn mcc_clear() { unsafe { OUT = Vec::new(); MSG = Vec::new(); } }
