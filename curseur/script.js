grist.ready({
    requiredAccess: 'full'
});

const slider = document.getElementById("slider");
const value = document.getElementById("value");

let record = null;

grist.onRecord(function(r){

    record = r;

    const v = Number(r["Aptitude 1"] ?? 0);

    slider.value = v;
    value.textContent = v;

});

slider.addEventListener("input",()=>{

    value.textContent = slider.value;

});

slider.addEventListener("change",async ()=>{

    if(!record)
        return;

    await grist.docApi.applyUserActions([
        [
            "UpdateRecord",
            record.tableId,
            record.id,
            {
                "Aptitude 1": Number(slider.value)
            }
        ]
    ]);

});
