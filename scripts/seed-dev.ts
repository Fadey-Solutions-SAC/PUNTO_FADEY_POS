import { registerOwner } from "../lib/setup";
import { prisma } from "../lib/db";

async function main() {
  if ((await prisma.user.count()) > 0) {
    console.log("Ya hay usuarios");
    return;
  }
  const created = await registerOwner({
    name: "Deyvi",
    email: "deyvi@fadey.local",
    password: "clave-segura",
    businessName: "Bodega Central",
    branchName: "Principal",
  });
  console.log(created.businessId);
  await prisma.$disconnect();
}

main();
