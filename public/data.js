export async function loadTodayData() {
    const response = await fetch("./today.json");
    return response.json();
}
