// server.js
var mongoClient = require("mongodb").MongoClient;
var express = require("express");
var cors = require("cors");

var connectionstring = "mongodb://127.0.0.1:27017/";
var app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

function addDaysISO(isoDate, days) {
  const d = new Date(isoDate + "T00:00:00");
  d.setDate(d.getDate() + Number(days));
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// ====================== ✅ FINE HELPERS (BACKEND) ======================
function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function parseISODate(iso) {
  if (!iso) return null;
  const d = new Date(String(iso).slice(0, 10) + "T00:00:00");
  return isNaN(d.getTime()) ? null : d;
}

// ✅ Fine slab logic
function calcFineSlab(dueDate) {
  const due = parseISODate(dueDate);
  if (!due) return { overdue: false, lateDays: 0, fine: 0 };

  const today = startOfToday();
  if (today <= due) return { overdue: false, lateDays: 0, fine: 0 };

  const diffMs = today - due;
  const lateDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  let fine = 0;
  if (lateDays >= 1 && lateDays <= 7) fine = 100;
  else if (lateDays >= 8 && lateDays <= 15) fine = 500;
  else if (lateDays >= 16 && lateDays <= 30) fine = 700;
  else fine = 1000;

  return { overdue: true, lateDays, fine };
}

function calcFineSlabWithEnd(dueDate, endDateISO) {
  const due = parseISODate(dueDate);
  if (!due) return { overdue: false, lateDays: 0, fine: 0 };

  const end = endDateISO ? parseISODate(endDateISO) : startOfToday();
  if (!end) return { overdue: false, lateDays: 0, fine: 0 };

  if (end <= due) return { overdue: false, lateDays: 0, fine: 0 };

  const diffMs = end - due;
  const lateDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  let fine = 0;
  if (lateDays >= 1 && lateDays <= 7) fine = 100;
  else if (lateDays >= 8 && lateDays <= 15) fine = 500;
  else if (lateDays >= 16 && lateDays <= 30) fine = 700;
  else fine = 1000;

  return { overdue: true, lateDays, fine };
}

function historyKey(rollNo, bookId, issueDate) {
  return `${Number(rollNo)}:${Number(bookId)}:${String(issueDate || "").slice(0, 10)}`;
}

function ymdToday() {
  return new Date().toISOString().slice(0, 10);
}

function normYMD(s, def) {
  const x = String(s || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(x) ? x : def;
}

function overdueDaysFromDue(dueYMD, endYMD) {
  const due = parseISODate(dueYMD);
  const end = parseISODate(endYMD || ymdToday());
  if (!due || !end) return 0;
  if (end <= due) return 0;
  return Math.ceil((end - due) / 86400000);
}


function fineKey(rollNo, bookId, dueDate) {
  return `${Number(rollNo)}:${Number(bookId)}:${String(dueDate || "").slice(0, 10)}`;
}

function fineIssueKey(rollNo, bookId, issueDate) {
  return `${Number(rollNo)}:${Number(bookId)}:${String(issueDate || "").slice(0, 10)}`;
}



// ✅ Attach fine info in issuedBooks (safe)
// ✅ Attach fine info in issuedBooks + keep paid status (safe)
function attachFineToStudent(student) {
  const issued = Array.isArray(student.issuedBooks) ? student.issuedBooks : [];

  const issuedWithFine = issued.map((b) => {
    const fineInfo = calcFineSlab(b.dueDate); // {overdue, lateDays, fine}

    // ✅ DB stored fields (if missing, default)
    const finePaid = b.finePaid === true;
    const fineAmount = Number(b.fineAmount || 0);
    const finePaidAt = b.finePaidAt || null;

    // ✅ If overdue and NOT PAID -> calculated fine
    // ✅ If PAID -> show stored fineAmount (so it won't change later)
    const finalFine = finePaid ? fineAmount : fineInfo.fine;

    return {
      ...b,
      overdue: fineInfo.overdue,
      lateDays: fineInfo.lateDays,
      fine: finalFine,

      // keep paid fields in response (frontend ke liye)
      finePaid,
      fineAmount: finePaid ? fineAmount : 0,
      finePaidAt
    };
  });

  // ✅ Pending fine total (only unpaid overdue items)
  const pendingFine = issuedWithFine.reduce((sum, x) => {
    if (x.overdue && x.finePaid !== true) return sum + (Number(x.fine) || 0);
    return sum;
  }, 0);

  const hasOverdue = issuedWithFine.some((x) => x.overdue);

  return { ...student, issuedBooks: issuedWithFine, pendingFine, hasOverdue };
}


app.get("/", (req, res) => {
  res.send("<h2>WELCOME TO LIBRARY MANAGEMENT PROJECT</h2>");
});

// ====================== ADMIN ======================
app.get("/getadmin", (req, res) => {
  mongoClient.connect(connectionstring, { useUnifiedTopology: true }, (err, clientObj) => {
    if (err) return res.status(500).send("DB connection failed");
    var dbo = clientObj.db("LibraryDB");
    dbo.collection("Admin").find().toArray((err, document) => {
      clientObj.close();
      if (err) return res.status(500).send("Failed to fetch admin");
      res.send(document);
    });
  });
});

// ====================== BOOKS ======================
app.get("/getbooks", (req, res) => {
  mongoClient.connect(connectionstring, { useUnifiedTopology: true }, (err, clientObj) => {
    if (err) return res.status(500).send("DB connection failed");
    var dbo = clientObj.db("LibraryDB");
    dbo.collection("tblBooks").find().toArray((err, document) => {
      clientObj.close();
      if (err) return res.status(500).send("Failed to fetch books");
      res.send(document);
    });
  });
});

app.post("/addbook", (req, res) => {
  mongoClient.connect(connectionstring, { useUnifiedTopology: true }, (err, clientObj) => {
    if (err) return res.status(500).send("DB connection failed");

    const dbo = clientObj.db("LibraryDB");
    const book = {
      id: Number(req.body.id),
      title: req.body.title,
      author: req.body.author,
      category: req.body.category,
      quantity: Number(req.body.quantity),
      status: req.body.status
    };

    dbo.collection("tblBooks").findOne({ id: book.id }, (err, existingBook) => {
      if (err) {
        clientObj.close();
        return res.status(500).send("Error checking existing book");
      }

      if (existingBook) {
        clientObj.close();
        return res.status(400).send("Book with this ID already exists ");
      }

      dbo.collection("tblBooks").insertOne(book, (err) => {
        clientObj.close();
        if (err) return res.status(500).send("Error while adding book");
        res.send("Book Added Successfully ✅");
      });
    });
  });
});

app.delete("/deletebook/:id", (req, res) => {
  mongoClient.connect(connectionstring, { useUnifiedTopology: true }, (err, clientObj) => {
    if (err) return res.status(500).send("DB connection failed");
    var dbo = clientObj.db("LibraryDB");

    dbo.collection("tblBooks").deleteOne({ id: Number(req.params.id) }, (err, result) => {
      clientObj.close();
      if (err) return res.status(500).send("Error deleting book");
      if (result.deletedCount === 0) return res.send("Book not found");
      res.send("Book Deleted Successfully");
    });
  });
});

app.put("/updatebook/:id", (req, res) => {
  mongoClient.connect(connectionstring, { useUnifiedTopology: true }, (err, client) => {
    if (err) return res.status(500).send("DB connection failed");

    const dbo = client.db("LibraryDB");

    const qty = Number(req.body.quantity);
    if (!Number.isInteger(qty) || qty < 0) {
      client.close();
      return res.status(400).send("Quantity must be 0 or greater ");
    }

    let status = String(req.body.status || "").trim();

    // ✅ if qty is 0 => book cannot be Available
    if (qty === 0 && status === "Available") status = "Issued";

    dbo.collection("tblBooks").updateOne(
      { id: Number(req.params.id) },
      {
        $set: {
          title: req.body.title,
          author: req.body.author,
          category: req.body.category,
          quantity: qty,
          status: status
        }
      },
      (err, result) => {
        client.close();
        if (err) return res.status(500).send("Update failed");
        if (result.matchedCount === 0) return res.status(404).send("Book not found");
        res.send("Book updated successfully ✅");
      }
    );
  });
});


// ✅ Book lookup (for autofill)
app.get("/getbook/:id", (req, res) => {
  mongoClient.connect(connectionstring, { useUnifiedTopology: true }, (err, client) => {
    if (err) return res.status(500).send("DB connection failed ");
    const dbo = client.db("LibraryDB");

    const idStr = String(req.params.id).trim();
    const idNum = Number(idStr);

    dbo.collection("tblBooks").findOne(
      { $or: [{ id: idNum }, { id: idStr }] },
      (err, book) => {
        client.close();
        if (err) return res.status(500).send("Failed to fetch book ");
        if (!book) return res.status(404).send("Book not found ");
        res.send(book);
      }
    );
  });
});

// ====================== STUDENTS ======================
app.post("/addstudent", (req, res) => {
  mongoClient.connect(connectionstring, { useUnifiedTopology: true }, (err, client) => {
    if (err) return res.status(500).send("DB connection failed");

    const dbo = client.db("LibraryDB");

    const student = {
      rollNo: Number(req.body.rollNo),
      name: String(req.body.name || "").trim().toUpperCase(),
      email: String(req.body.email || "").trim(),
      mobile: String(req.body.mobile || "").trim(),
      course: String(req.body.course || "").trim()
    };

    if (!student.rollNo || !student.name || !student.email || !student.mobile || !student.course) {
      client.close();
      return res.status(400).send("All fields are required ");
    }

    dbo.collection("Students").findOne(
      { rollNo: student.rollNo, course: student.course },
      (err, existingStudent) => {
        if (err) {
          client.close();
          return res.status(500).send("Error checking existing student");
        }

        if (existingStudent) {
          client.close();
          return res.status(400).send("Student with this Roll No and Course already exists ");
        }

        dbo.collection("Students").insertOne(student, (err) => {
          client.close();
          if (err) return res.status(500).send("Failed to add student");
          res.send("Student added successfully ");
        });
      }
    );
  });
});

// ✅ GET ALL STUDENTS (NOW WITH FINE INFO ADDED)
app.get("/getstudents", (req, res) => {
  mongoClient.connect(connectionstring, { useUnifiedTopology: true }, (err, client) => {
    if (err) return res.status(500).send("DB connection failed");

    const dbo = client.db("LibraryDB");
    dbo.collection("Students").find().toArray((err, students) => {
      client.close();
      if (err) return res.status(500).send("Failed to fetch students");

      students = students || [];
      const enriched = students.map(attachFineToStudent);
      res.send(enriched);
    });
  });
});

app.delete("/deletestudent/:rollNo/:course", (req, res) => {
  mongoClient.connect(connectionstring, { useUnifiedTopology: true }, (err, client) => {
    if (err) return res.status(500).send("DB connection failed");

    const dbo = client.db("LibraryDB");
    dbo.collection("Students").deleteOne(
      { rollNo: Number(req.params.rollNo), course: String(req.params.course) },
      (err, result) => {
        client.close();
        if (err) return res.status(500).send("Failed to delete student");
        if (result.deletedCount === 0) return res.status(404).send("Student not found ");
        res.send("Student deleted successfully ");
      }
    );
  });
});

app.put("/updatestudent/:rollNo/:course", (req, res) => {
  mongoClient.connect(connectionstring, { useUnifiedTopology: true }, (err, client) => {
    if (err) return res.status(500).send("DB connection failed ");

    const dbo = client.db("LibraryDB");

    const oldRollNo = Number(req.params.rollNo);
    const oldCourse = String(req.params.course);

    const updated = {
      rollNo: Number(req.body.rollNo),
      name: String(req.body.name || "").trim().toUpperCase(),
      email: String(req.body.email || "").trim(),
      mobile: String(req.body.mobile || "").trim(),
      course: String(req.body.course || "").trim()
    };

    if (!updated.rollNo || !updated.name || !updated.email || !updated.mobile || !updated.course) {
      client.close();
      return res.status(400).send("All fields are required ");
    }

    const changingKey = (updated.rollNo !== oldRollNo) || (updated.course !== oldCourse);

    const proceedUpdate = () => {
      dbo.collection("Students").updateOne(
        { rollNo: oldRollNo, course: oldCourse },
        {
          $set: {
            rollNo: updated.rollNo,
            course: updated.course,
            name: updated.name,
            email: updated.email,
            mobile: updated.mobile
          }
        },
        (err, result) => {
          client.close();
          if (err) return res.status(500).send("Update failed ");
          if (result.matchedCount === 0) return res.status(404).send("Student not found ");
          res.send("Student updated successfully ");
        }
      );
    };

    if (!changingKey) return proceedUpdate();

    dbo.collection("Students").findOne(
      { rollNo: updated.rollNo, course: updated.course },
      (err, exists) => {
        if (err) {
          client.close();
          return res.status(500).send("Error checking existing student");
        }

        if (exists && !(exists.rollNo === oldRollNo && exists.course === oldCourse)) {
          client.close();
          return res.status(400).send("Another student with this Roll No and Course already exists ");
        }

        proceedUpdate();
      }
    );
  });
});

// ✅ Student lookup (NOW WITH FINE INFO ADDED)
app.get("/getstudent/:rollNo", (req, res) => {
  mongoClient.connect(connectionstring, { useUnifiedTopology: true }, (err, client) => {
    if (err) return res.status(500).send("DB connection failed ");
    const dbo = client.db("LibraryDB");

    const rollStr = String(req.params.rollNo).trim();
    const rollNum = Number(rollStr);

    dbo.collection("Students").findOne(
      { $or: [{ rollNo: rollNum }, { rollNo: rollStr }] },
      (err, student) => {
        if (err) { client.close(); return res.status(500).send("Failed to fetch student "); }
        if (!student) { client.close(); return res.status(404).send("Student not found "); }

        const issued = Array.isArray(student.issuedBooks) ? student.issuedBooks : [];
        if (!issued.length) {
          client.close();
          return res.send({
            ...student,
            issuedBooks: [],
            hasOverdue: false,
            pendingFine: 0
          });
        }

        // ✅ Fetch fines for this student for all issued bookIds
        const bookIds = [...new Set(issued.map(b => Number(b.bookId)))];

        dbo.collection("FineTransactions")
          .find({ rollNo: Number(student.rollNo), bookId: { $in: bookIds } })
          .toArray((err, docs) => {
            client.close();
            if (err) return res.status(500).send("Failed to fetch fine status ");

            // ✅ Map by rollNo:bookId:issueDate (most reliable)
            const map = new Map(
              (docs || []).map(d => [
                fineIssueKey(d.rollNo, d.bookId, d.issueDate),
                d
              ])
            );

            const mergedIssued = issued.map(b => {
              const ikey = fineIssueKey(student.rollNo, b.bookId, b.issueDate);
              const tx = map.get(ikey);

              const info = calcFineSlab(b.dueDate);
              const isPaid = tx && String(tx.status).toUpperCase() === "PAID";

              return {
                ...b,
                overdue: info.overdue,
                lateDays: info.lateDays,

                // ✅ if paid -> show paid amount else current slab fine
                fine: isPaid ? Number(tx.fineAmount || 0) : (info.overdue ? info.fine : 0),

                finePaid: !!isPaid,
                finePaidAt: isPaid ? (tx.paidAt || null) : null,
                fineAmount: isPaid ? Number(tx.fineAmount || 0) : 0
              };
            });

            res.send({
              ...student,
              issuedBooks: mergedIssued,
              hasOverdue: mergedIssued.some(x => x.overdue),
              pendingFine: mergedIssued.reduce((sum, x) => {
                if (x.overdue && !x.finePaid) return sum + (Number(x.fine) || 0);
                return sum;
              }, 0)
            });
          });
      }
    );
  });
});



// ====================== ISSUE BOOKS ======================
// ✅ SINGLE BOOK
app.post("/issuebook", (req, res) => {
  const rollNo = Number(req.body.rollNo);
  const bookId = Number(req.body.bookId);
  const issueDate = String(req.body.issueDate || "").trim() || new Date().toISOString().slice(0, 10);

  const loanDays = Number(req.body.loanDays) || 7;
  const dueDate = String(req.body.dueDate || "").trim() || addDaysISO(issueDate, loanDays);

  req.body = {
    rollNo,
    bookIds: [bookId],
    issueDate,
    loanDays,
    dueDate
  };
  return issueBooksHandler(req, res);
});

// ✅ MULTI BOOKS
app.post("/issuebooks", (req, res) => {
  return issueBooksHandler(req, res);
});

function issueBooksHandler(req, res) {
  mongoClient.connect(connectionstring, { useUnifiedTopology: true }, (err, client) => {
    if (err) return res.status(500).send("DB connection failed ");

    const dbo = client.db("LibraryDB");

    const rollNo = Number(req.body.rollNo);
    const bookIds = Array.isArray(req.body.bookIds) ? req.body.bookIds.map(Number) : [];
    const issueDate = String(req.body.issueDate || "").trim() || new Date().toISOString().slice(0, 10);

    const loanDays = Number(req.body.loanDays) || 7;
    const dueDate = String(req.body.dueDate || "").trim() || addDaysISO(issueDate, loanDays);

    if (!rollNo || !bookIds.length) {
      client.close();
      return res.status(400).send("rollNo and bookIds required ");
    }

    if (bookIds.length > 3) {
      client.close();
      return res.status(400).send("Maximum 3 books allowed ");
    }

    const uniq = new Set(bookIds);
    if (uniq.size !== bookIds.length) {
      client.close();
      return res.status(400).send("Duplicate Book IDs in request ");
    }

    dbo.collection("Students").findOne({ rollNo }, (err, student) => {
      if (err) { client.close(); return res.status(500).send("Failed to fetch student "); }
      if (!student) { client.close(); return res.status(404).send("Student not found "); }

      const issuedBooks = Array.isArray(student.issuedBooks) ? student.issuedBooks : [];
      const alreadyIssuedCount = issuedBooks.length;

      if (alreadyIssuedCount + bookIds.length > 3) {
        client.close();
        return res.status(400).send(`Student can issue max 3 books. Already issued: ${alreadyIssuedCount} `);
      }

      const alreadySet = new Set(issuedBooks.map(b => Number(b.bookId)));
      for (const id of bookIds) {
        if (alreadySet.has(id)) {
          client.close();
          return res.status(400).send(`Book ${id} already issued to this student `);
        }
      }

      dbo.collection("tblBooks").find({ id: { $in: bookIds } }).toArray((err, books) => {
        if (err) { client.close(); return res.status(500).send("Failed to fetch books "); }

        if (!books || books.length !== bookIds.length) {
          client.close();
          return res.status(404).send("One or more books not found ");
        }

        for (const b of books) {
          const st = String(b.status || "").toUpperCase();
          const q = Number(b.quantity || 0);

          // ✅ block if qty 0
          if (q <= 0) {
            client.close();
            return res.status(400).send(`Book ${b.id} not available (0 qty) `);
          }

          // ✅ block if admin set Not Available or Issued
          if (st !== "AVAILABLE") {
            client.close();
            return res.status(400).send(`Book ${b.id} is ${b.status}  (cannot issue)`);
          }
        }


        const decremented = [];
        const issuedRecords = [];
        const historyDocs = [];
        const bookMap = new Map(books.map(b => [Number(b.id), b]));

        const updateNextBook = (i) => {
          if (i >= bookIds.length) {
            dbo.collection("Students").updateOne(
              { rollNo },
              { $push: { issuedBooks: { $each: issuedRecords } } },
              (err, stuUpd) => {
                if (err || !stuUpd || stuUpd.matchedCount === 0) {
                  rollbackBooks(() => {
                    client.close();
                    return res.status(500).send("Failed to update student ");
                  });
                  return;
                }

                // ✅ NOW insert history records (after student update success)
                dbo.collection("IssueHistory").insertMany(historyDocs, { ordered: false }, (histErr) => {
                  // (optional) ignore history error, but still proceed
                  // if (histErr) console.log("History insert error:", histErr);

                  client.close();
                  res.send("Books issued successfully ");
                });
              }
            );
            return;
          }


          const id = bookIds[i];
          const bk = bookMap.get(id);

          dbo.collection("tblBooks").findOneAndUpdate(
            { id: id, quantity: { $gt: 0 } },
            { $inc: { quantity: -1 } },
            { returnDocument: "after" },
            (err, result) => {
              if (err || !result || !result.value) {
                rollbackBooks(() => {
                  client.close();
                  res.status(400).send(`Book ${id} not available `);
                });
                return;
              }

              decremented.push(id);

              const newQty = Number(result.value.quantity);
              const newStatus = newQty > 0 ? "Available" : "Issued";
              dbo.collection("tblBooks").updateOne({ id }, { $set: { status: newStatus } }, () => { });

              issuedRecords.push({
                bookId: id,
                bookName: bk.title,
                issueDate,
                loanDays,
                dueDate,
                finePaid: false,
                fineAmount: 0,
                finePaidAt: null
              });
              historyDocs.push({
                historyKey: historyKey(rollNo, id, issueDate),
                rollNo,
                name: student.name || "",
                course: student.course || "",
                bookId: id,
                bookName: bk.title,
                issueDate: String(issueDate).slice(0, 10),
                dueDate: String(dueDate).slice(0, 10),
                loanDays,
                status: "ISSUED",
                returnDate: null,
                paidFineAmount: 0,
                paidAt: null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
              });


              updateNextBook(i + 1);
            }
          );
        };

        function rollbackBooks(done) {
          if (decremented.length === 0) return done();
          let left = decremented.length;

          decremented.forEach((id) => {
            dbo.collection("tblBooks").updateOne(
              { id },
              { $inc: { quantity: 1 }, $set: { status: "Available" } },
              () => {
                left--;
                if (left === 0) done();
              }
            );
          });
        }

        updateNextBook(0);
      });
    });
  });
}

// ====================== ✅ PAY FINE (SAVE IN FineTransactions) ======================
app.post("/payfine", (req, res) => {
  mongoClient.connect(connectionstring, { useUnifiedTopology: true }, (err, client) => {
    if (err) return res.status(500).send("DB connection failed ");
    const dbo = client.db("LibraryDB");

    const rollNo = Number(req.body.rollNo);
    const bookId = Number(req.body.bookId);

    const paymentMethod = String(req.body.paymentMethod || "CASH").toUpperCase(); // CASH | UPI
    const paymentRef = String(req.body.paymentRef || "").trim();                 // UTR / ref no
    const collectedBy = String(req.body.collectedBy || "").trim();               // Admin name
    const notes = String(req.body.notes || "").trim();

    if (!rollNo || !bookId) {
      client.close();
      return res.status(400).send("rollNo and bookId required ");
    }

    dbo.collection("Students").findOne({ rollNo }, (err, student) => {
      if (err) { client.close(); return res.status(500).send("Failed to fetch student "); }
      if (!student) { client.close(); return res.status(404).send("Student not found "); }

      const issued = Array.isArray(student.issuedBooks) ? student.issuedBooks : [];
      const item = issued.find(b => Number(b.bookId) === bookId);
      if (!item) { client.close(); return res.status(404).send("Issued book not found "); }

      const fineInfo = calcFineSlab(item.dueDate);
      if (!fineInfo.overdue) { client.close(); return res.status(400).send("Book is not overdue "); }

      const key = fineKey(rollNo, bookId, item.dueDate);

      dbo.collection("FineTransactions").findOne({ fineKey: key, status: "PAID" }, (err, paidDoc) => {
        if (paidDoc) { client.close(); return res.status(400).send("Fine already paid "); }

        const nowISO = new Date().toISOString();

        dbo.collection("FineTransactions").updateOne(
          { fineKey: key },
          {
            $setOnInsert: {
              fineKey: key,
              createdAt: nowISO
            },
            $set: {
              rollNo,
              name: student.name || "",
              course: student.course || "",
              bookId,
              bookName: item.bookName || "",
              issueDate: String(item.issueDate || ""),
              dueDate: String(item.dueDate || "").slice(0, 10),

              overdue: true,
              lateDays: fineInfo.lateDays,

              fineAmount: fineInfo.fine,     // freeze at payment time
              status: "PAID",
              paidAt: nowISO,
              updatedAt: nowISO,

              // ✅ new fields
              paymentMethod,
              paymentRef,
              collectedBy,
              notes
            }
          },
          { upsert: true },
          (err) => {
            client.close();
            if (err) return res.status(500).send("Failed to update fine ");
            // ✅ keep IssueHistory in sync (reporting easy)
            dbo.collection("IssueHistory").updateOne(
              { historyKey: historyKey(rollNo, bookId, item.issueDate) },
              { $set: { paidAt: nowISO, paidFineAmount: fineInfo.fine, updatedAt: nowISO } },
              () => { }
            );

            res.send(`Fine paid successfully ✅ (₹${fineInfo.fine}) via ${paymentMethod}`);
          }
        );
      });
    });
  });
});




// ====================== ✅ FINE SUMMARY (NEW) ======================
// ====================== ✅ FINE SUMMARY (PER BOOK ROWS - OLD LOGIC) ======================
app.get("/finesummary", (req, res) => {
  mongoClient.connect(connectionstring, { useUnifiedTopology: true }, (err, client) => {
    if (err) return res.status(500).send("DB connection failed ");

    const dbo = client.db("LibraryDB");

    dbo.collection("Students").find().toArray((err, students) => {
      if (err) { client.close(); return res.status(500).send("Failed to fetch students "); }

      students = students || [];
      const bulkOps = [];
      const nowISO = new Date().toISOString();

      // ✅ Ensure FineTransactions doc exists for each overdue book (1 doc per fineKey)
      // ✅ Ensure FineTransactions doc exists for each overdue book (1 doc per fineKey)
      students.forEach((s) => {
        const issued = Array.isArray(s.issuedBooks) ? s.issuedBooks : [];

        issued.forEach((b) => {
          const info = calcFineSlab(b.dueDate);
          if (!info.overdue) return;

          const key = fineKey(s.rollNo, b.bookId, b.dueDate);

          // 1) upsert base doc (works in all Mongo versions)
          bulkOps.push({
            updateOne: {
              filter: { fineKey: key },
              update: {
                $setOnInsert: {
                  fineKey: key,
                  createdAt: nowISO,
                  status: "PENDING"
                },
                $set: {
                  rollNo: Number(s.rollNo),
                  name: String(s.name || ""),
                  course: String(s.course || ""),
                  bookId: Number(b.bookId),
                  bookName: String(b.bookName || ""),
                  issueDate: String(b.issueDate || ""),
                  dueDate: String(b.dueDate || "").slice(0, 10),
                  overdue: true,
                  lateDays: Number(info.lateDays || 0),
                  updatedAt: nowISO
                }
              },
              upsert: true
            }
          });

          // 2) ONLY pending docs -> keep updating fineAmount (PAID freeze rahe)
          bulkOps.push({
            updateOne: {
              filter: { fineKey: key, status: { $ne: "PAID" } },
              update: {
                $set: {
                  fineAmount: Number(info.fine || 0),
                  status: "PENDING",
                  updatedAt: nowISO
                }
              }
            }
          });
        });
      });


      const afterUpsert = () => {
        dbo.collection("FineTransactions").find({ overdue: true }).toArray((err, fines) => {
          client.close();
          if (err) return res.status(500).send("Failed to fetch fines ");

          fines = fines || [];

          let pendingTotal = 0;
          let collectedTotal = 0;

          const pendingStudentsSet = new Set(); // ✅ ONLY unpaid students
          const paidStudentsSet = new Set();    // (optional info)

          const allRows = fines.map((f) => {
            const status = String(f.status || "PENDING").toUpperCase();
            const fineAmt = Number(f.fineAmount || 0);
            const rollNo = Number(f.rollNo);

            if (status === "PAID") {
              collectedTotal += fineAmt;
              paidStudentsSet.add(rollNo);
            } else {
              pendingTotal += fineAmt;
              pendingStudentsSet.add(rollNo);
            }

            return {
              rollNo,
              name: f.name || "-",
              course: f.course || "-",
              bookId: Number(f.bookId),
              bookName: f.bookName || "-",
              dueDate: f.dueDate || "-",
              overdueDays: Number(f.lateDays || 0),
              fine: fineAmt,
              status: status === "PAID" ? "PAID" : "PENDING",
              paidAt: f.paidAt || null
            };
          });

          // ✅ table filter: default PENDING, optional PAID
          const mode = String(req.query.mode || "PENDING").toUpperCase();

          let rows = (mode === "PAID")
            ? allRows.filter(r => r.status === "PAID")
            : allRows.filter(r => r.status === "PENDING");

          // ✅ sorting
          if (mode === "PAID") {
            // latest payment first
            rows.sort((a, b) => {
              const da = a.paidAt ? new Date(a.paidAt).getTime() : 0;
              const db = b.paidAt ? new Date(b.paidAt).getTime() : 0;
              return db - da;
            });
          } else {
            // pending: highest overdue first
            rows.sort((a, b) => b.overdueDays - a.overdueDays);
          }

          res.send({
            pendingTotal,
            collectedTotal,

            // ✅ unpaid students count
            studentsWithFine: pendingStudentsSet.size,

            // ✅ always total overdue books (paid + pending)
            totalOverdueBooks: allRows.length,

            // (optional) current mode rows count
            modeRowsCount: rows.length,

            mode,
            rows
          });


        });
      };

      if (!bulkOps.length) return afterUpsert();

      dbo.collection("FineTransactions").bulkWrite(bulkOps, { ordered: false }, () => {
        afterUpsert();
      });
    });
  });
});


// ====================== RETURN BOOK ======================

// ====================== RETURN BOOK (BLOCK IF FINE NOT PAID) ======================
app.post("/returnbook", (req, res) => {
  mongoClient.connect(connectionstring, { useUnifiedTopology: true }, (err, client) => {
    if (err) return res.status(500).send("DB connection failed ");

    const dbo = client.db("LibraryDB");
    const rollNo = Number(req.body.rollNo);
    const bookId = Number(req.body.bookId);

    if (!rollNo || !bookId) {
      client.close();
      return res.status(400).send("rollNo and bookId required ");
    }

    dbo.collection("Students").findOne({ rollNo }, (err, student) => {
      if (err) { client.close(); return res.status(500).send("Failed to fetch student "); }
      if (!student) { client.close(); return res.status(404).send("Student not found "); }

      const issued = Array.isArray(student.issuedBooks) ? student.issuedBooks : [];
      const bookItem = issued.find(b => Number(b.bookId) === bookId);

      if (!bookItem) {
        client.close();
        return res.status(400).send("This book is not issued to this student ");
      }

      // ✅ If overdue -> check FineTransactions PAID
      const fineInfo = calcFineSlab(bookItem.dueDate);

      if (fineInfo.overdue) {
        const key = fineKey(rollNo, bookId, bookItem.dueDate);

        return dbo.collection("FineTransactions").findOne(
          { fineKey: key, status: "PAID" },
          (err, paidDoc) => {
            if (err) { client.close(); return res.status(500).send("Fine check failed "); }

            if (!paidDoc) {
              client.close();
              return res
                .status(400)
                .send(`Pay fine first  Fine: ₹${fineInfo.fine} (Late: ${fineInfo.lateDays} days)`);
            }

            // ✅ allow return
            doReturn();
          }
        );
      }

      // not overdue -> allow return
      doReturn();

      function doReturn() {
        const nowISO = new Date().toISOString();
        const retDate = nowISO.slice(0, 10);

        dbo.collection("IssueHistory").updateOne(
          { historyKey: historyKey(rollNo, bookId, bookItem.issueDate) },
          {
            $setOnInsert: {
              historyKey: historyKey(rollNo, bookId, bookItem.issueDate),
              rollNo,
              name: student.name || "",
              course: student.course || "",
              bookId,
              bookName: bookItem.bookName || "",
              issueDate: String(bookItem.issueDate || "").slice(0, 10),
              dueDate: String(bookItem.dueDate || "").slice(0, 10),
              loanDays: Number(bookItem.loanDays || 0),
              createdAt: nowISO
            },
            $set: {
              status: "RETURNED",
              returnDate: retDate,
              updatedAt: nowISO
            }
          },
          { upsert: true },
          () => {
            // ignore errors (optional)
          }
        );

        dbo.collection("Students").updateOne(
          { rollNo },
          { $pull: { issuedBooks: { bookId: bookId } } },
          (err, sUpd) => {
            if (err) { client.close(); return res.status(500).send("Failed to update student "); }
            if (!sUpd || sUpd.matchedCount === 0) { client.close(); return res.status(404).send("Student not found "); }

            dbo.collection("tblBooks").findOneAndUpdate(
              { id: bookId },
              { $inc: { quantity: 1 }, $set: { status: "Available" } },
              { returnDocument: "after" },
              (err, bUpd) => {
                client.close();

                if (err) return res.status(500).send("Failed to update book ");
                if (!bUpd || !bUpd.value) return res.status(404).send("Book not found (student updated) ");

                res.send("Book returned successfully ");
              }
            );
          }
        );
      }
    });
  });
});

app.get("/studenthistory/:rollNo", (req, res) => {
  mongoClient.connect(connectionstring, { useUnifiedTopology: true }, (err, client) => {
    if (err) return res.status(500).send("DB connection failed ");
    const dbo = client.db("LibraryDB");

    const rollNo = Number(req.params.rollNo);
    if (!rollNo) { client.close(); return res.status(400).send("Invalid rollNo "); }

    dbo.collection("IssueHistory")
      .find({ rollNo })
      .sort({ issueDate: -1, updatedAt: -1 })
      .toArray((err, history) => {
        if (err) { client.close(); return res.status(500).send("Failed to fetch history "); }

        history = history || [];
        if (!history.length) { client.close(); return res.send([]); }

        const keys = history.map(h => fineKey(rollNo, h.bookId, h.dueDate));

        dbo.collection("FineTransactions").find({ fineKey: { $in: keys } }).toArray((err, fines) => {
          client.close();
          if (err) return res.status(500).send("Failed to fetch fine history ");

          const map = new Map((fines || []).map(f => [f.fineKey, f]));

          const rows = history.map(h => {
            const fk = fineKey(rollNo, h.bookId, h.dueDate);
            const tx = map.get(fk);

            const endDate = h.returnDate ? h.returnDate : new Date().toISOString().slice(0, 10);
            const slab = calcFineSlabWithEnd(h.dueDate, endDate);

            const isPaid = tx && String(tx.status).toUpperCase() === "PAID";
            const paidAmt = isPaid ? Number(tx.fineAmount || 0) : 0;

            return {
              bookId: Number(h.bookId),
              bookName: h.bookName || "-",
              issueDate: h.issueDate || "-",
              dueDate: h.dueDate || "-",
              returnDate: h.returnDate || null,
              status: h.returnDate ? "RETURNED" : "ISSUED",

              overdueDays: slab.overdue ? slab.lateDays : 0,

              fine: isPaid ? paidAmt : (slab.overdue ? slab.fine : 0),

              paid: !!isPaid,
              paidAt: isPaid ? (tx.paidAt || null) : null,
              paymentMethod: isPaid ? (tx.paymentMethod || null) : null,
              paymentRef: isPaid ? (tx.paymentRef || null) : null
            };
          });

          // latest first already by issueDate sort
          res.send(rows);
        });
      });
  });
});

app.get("/dashboardactivity", (req, res) => {
  mongoClient.connect(connectionstring, { useUnifiedTopology: true }, async (err, client) => {
    if (err) return res.status(500).send("DB connection failed ");
    const dbo = client.db("LibraryDB");

    try {
      const todayISO = String(req.query.date || new Date().toISOString().slice(0, 10)).slice(0, 10);

      // Today issued/returned
      const hist = await dbo.collection("IssueHistory")
        .find({ $or: [{ issueDate: todayISO }, { returnDate: todayISO }] })
        .sort({ updatedAt: -1, createdAt: -1 })
        .toArray();

      const histRows = (hist || []).map(h => {
        const type = (h.returnDate === todayISO) ? "RETURNED" : "ISSUED";
        const at = (h.updatedAt || h.createdAt || new Date().toISOString());

        return {
          type,
          at,
          rollNo: Number(h.rollNo),
          name: h.name || "-",
          course: h.course || "-",
          bookId: Number(h.bookId),
          bookName: h.bookName || "-",
          issueDate: h.issueDate || "-",
          dueDate: h.dueDate || "-"
        };
      });

      // Overdue as of today
      const students = await dbo.collection("Students").find().toArray();
      const todayDate = new Date(todayISO + "T00:00:00");

      const overdueRows = [];
      (students || []).forEach(s => {
        const issued = Array.isArray(s.issuedBooks) ? s.issuedBooks : [];
        issued.forEach(b => {
          const due = parseISODate(b.dueDate);
          if (!due) return;
          if (due < todayDate) {
            overdueRows.push({
              type: "OVERDUE",
              at: todayISO + "T00:00:00.000Z",
              rollNo: Number(s.rollNo),
              name: s.name || "-",
              course: s.course || "-",
              bookId: Number(b.bookId),
              bookName: b.bookName || "-",
              issueDate: b.issueDate || "-",
              dueDate: String(b.dueDate || "").slice(0, 10) || "-"
            });
          }
        });
      });

      // Merge + latest top
      const rows = [...histRows, ...overdueRows].sort((a, b) => {
        const da = a.at ? new Date(a.at).getTime() : 0;
        const db = b.at ? new Date(b.at).getTime() : 0;
        return db - da;
      });

      res.send({ date: todayISO, rows });

    } catch (e) {
      res.status(500).send("Failed to load dashboard activity ");
    } finally {
      client.close();
    }
  });
});
//report section
app.get("/report/activity", (req, res) => {
  mongoClient.connect(connectionstring, { useUnifiedTopology: true }, async (err, client) => {
    if (err) return res.status(500).send("DB connection failed ");
    const dbo = client.db("LibraryDB");

    try {
      const today = ymdToday();
      const from = normYMD(req.query.from, today);
      const to = normYMD(req.query.to, today);
      const type = String(req.query.type || "ALL").toUpperCase(); // ALL|ISSUED|RETURNED|OVERDUE

      const rollNo = req.query.rollNo ? Number(req.query.rollNo) : null;
      const course = String(req.query.course || "").trim();
      const bookId = req.query.bookId ? Number(req.query.bookId) : null;

      const base = {};
      if (rollNo) base.rollNo = rollNo;
      if (course) base.course = course;
      if (bookId) base.bookId = bookId;

      let query = { ...base };

      if (type === "ISSUED") {
        query.issueDate = { $gte: from, $lte: to };
        query.status = "ISSUED";
      } else if (type === "RETURNED") {
        query.returnDate = { $gte: from, $lte: to };
        query.status = "RETURNED";
      } else if (type === "OVERDUE") {
        query.status = "ISSUED";
        query.returnDate = null;
        query.dueDate = { $lt: today, $gte: from, $lte: to };
      } else {
        // ALL: issued in range OR returned in range OR overdue in range
        query.$or = [
          { status: "ISSUED", issueDate: { $gte: from, $lte: to } },
          { status: "RETURNED", returnDate: { $gte: from, $lte: to } },
          { status: "ISSUED", returnDate: null, dueDate: { $lt: today, $gte: from, $lte: to } }
        ];
      }

      const docs = await dbo.collection("IssueHistory")
        .find(query)
        .sort({ updatedAt: -1, createdAt: -1 })
        .toArray();

      const rows = (docs || []).map(d => {
        let t = String(d.status || "").toUpperCase();
        if (t === "ISSUED" && !d.returnDate && String(d.dueDate || "") < today) t = "OVERDUE";

        return {
          type: t,
          rollNo: Number(d.rollNo),
          name: d.name || "-",
          course: d.course || "-",
          bookId: Number(d.bookId),
          issueDate: String(d.issueDate || "-").slice(0, 10),
          dueDate: String(d.dueDate || "-").slice(0, 10),
          returnDate: d.returnDate ? String(d.returnDate).slice(0, 10) : null,
          at: (d.updatedAt || d.createdAt || new Date().toISOString())
        };
      });

      res.send({ from, to, type, rows });
    } catch (e) {
      res.status(500).send("Failed to load report activity ");
    } finally {
      client.close();
    }
  });
});

app.get("/report/overdue", (req, res) => {
  mongoClient.connect(connectionstring, { useUnifiedTopology: true }, async (err, client) => {
    if (err) return res.status(500).send("DB connection failed ");
    const dbo = client.db("LibraryDB");

    try {
      const today = ymdToday();

      const from = normYMD(req.query.from, today);
      const to = normYMD(req.query.to, today);

      const rollNo = req.query.rollNo ? Number(req.query.rollNo) : null;
      const course = String(req.query.course || "").trim();
      const bookId = req.query.bookId ? Number(req.query.bookId) : null;

      // ✅ current overdue only (not returned)
      const q = {
        status: "ISSUED",
        returnDate: null,
        dueDate: { $lt: today, $gte: from, $lte: to } // ✅ dueDate range + overdue condition
      };

      if (rollNo) q.rollNo = rollNo;
      if (course) q.course = course;
      if (bookId) q.bookId = bookId;

      const docs = await dbo.collection("IssueHistory")
        .find(q)
        .sort({ dueDate: 1, updatedAt: -1 })
        .toArray();

      const rows = (docs || []).map(d => ({
        rollNo: Number(d.rollNo),
        name: d.name || "-",
        course: d.course || "-",
        bookId: Number(d.bookId),
        issueDate: String(d.issueDate || "-").slice(0, 10),
        dueDate: String(d.dueDate || "-").slice(0, 10),
        overdueDays: overdueDaysFromDue(d.dueDate, today),
        status: "OVERDUE"
      }));

      res.send({ from, to, rows });
    } catch (e) {
      res.status(500).send("Failed to load overdue report ");
    } finally {
      client.close();
    }
  });
});

app.get("/report/fines", (req, res) => {
  mongoClient.connect(connectionstring, { useUnifiedTopology: true }, async (err, client) => {
    if (err) return res.status(500).send("DB connection failed ");
    const dbo = client.db("LibraryDB");

    try {
      const today = ymdToday();
      const mode = String(req.query.mode || "PENDING").toUpperCase(); // PENDING|PAID

      const from = normYMD(req.query.from, today);
      const to = normYMD(req.query.to, today);

      const rollNo = req.query.rollNo ? Number(req.query.rollNo) : null;
      const course = String(req.query.course || "").trim();
      const bookId = req.query.bookId ? Number(req.query.bookId) : null;

      const q = { overdue: true };
      if (rollNo) q.rollNo = rollNo;
      if (course) q.course = course;
      if (bookId) q.bookId = bookId;

      if (mode === "PAID") q.status = "PAID";
      else q.status = { $ne: "PAID" };

      let docs = await dbo.collection("FineTransactions")
        .find(q)
        .sort({ paidAt: -1, updatedAt: -1 })
        .toArray();

      // ✅ date range apply:
      // - PAID: paidAt date filter
      // - PENDING: dueDate filter (optional but consistent)
      docs = (docs || []).filter(d => {
        if (mode === "PAID") {
          const paidYMD = d.paidAt ? String(d.paidAt).slice(0, 10) : "";
          return paidYMD >= from && paidYMD <= to;
        } else {
          const dueYMD = d.dueDate ? String(d.dueDate).slice(0, 10) : "";
          return dueYMD >= from && dueYMD <= to;
        }
      });

      const rows = docs.map(d => ({
        rollNo: Number(d.rollNo),
        name: d.name || "-",
        course: d.course || "-",
        bookId: Number(d.bookId),

        // ✅ issueDate added
        issueDate: d.issueDate ? String(d.issueDate).slice(0, 10) : "-",

        dueDate: d.dueDate ? String(d.dueDate).slice(0, 10) : "-",
        overdueDays: Number(d.lateDays || 0),

        // ✅ fine amount always available
        fineAmount: Number(d.fineAmount || 0),

        status: String(d.status || "PENDING").toUpperCase(),

        // ✅ PAID only
        paidAt: d.paidAt ? String(d.paidAt).slice(0, 10) : null
      }));

      res.send({ mode, from, to, rows });
    } catch (e) {
      res.status(500).send("Failed to load fine report ");
    } finally {
      client.close();
    }
  });
});

app.get("/report/inventory", (req, res) => {
  mongoClient.connect(connectionstring, { useUnifiedTopology: true }, async (err, client) => {
    if (err) return res.status(500).send("DB connection failed ");
    const dbo = client.db("LibraryDB");

    try {
      const status = String(req.query.status || "").trim(); // Available/Issued/Not Available
      const low = String(req.query.low || "").trim();       // "1" => qty <= 2

      const q = {};
      if (status) q.status = new RegExp("^" + status + "$", "i");
      if (low === "1") q.quantity = { $lte: 2 };

      const books = await dbo.collection("tblBooks").find(q).sort({ id: 1 }).toArray();

      res.send({
        rows: (books || []).map(b => ({
          id: Number(b.id),
          bookName: b.title || "",
          author: b.author || "",
          category: b.category || "",
          qty: Number(b.quantity || 0),
          status: b.status || ""
        }))
      });
    } catch (e) {
      res.status(500).send("Failed to load inventory report ");
    } finally {
      client.close();
    }
  });
});

app.get("/report/studentledger/:rollNo", (req, res) => {
  mongoClient.connect(connectionstring, { useUnifiedTopology: true }, async (err, client) => {
    if (err) return res.status(500).send("DB connection failed ");
    const dbo = client.db("LibraryDB");

    try {
      const rollNo = Number(req.params.rollNo);
      if (!rollNo) return res.status(400).send("Invalid rollNo ");

      // ✅ student basic info
      const student = await dbo.collection("Students").findOne({ rollNo });
      if (!student) return res.status(404).send("Student not found ");

      // ✅ history (issued/returned) latest first
      const history = await dbo.collection("IssueHistory")
        .find({ rollNo })
        .sort({ issueDate: -1, updatedAt: -1 })
        .toArray();

      // ✅ fine tx map (by fineKey: rollNo:bookId:dueDate)
      const keys = (history || []).map(h => fineKey(rollNo, h.bookId, h.dueDate));
      const fines = keys.length
        ? await dbo.collection("FineTransactions").find({ fineKey: { $in: keys } }).toArray()
        : [];

      const fineMap = new Map((fines || []).map(f => [f.fineKey, f]));
      const today = ymdToday();

      const rows = (history || []).map(h => {
        const fk = fineKey(rollNo, h.bookId, h.dueDate);
        const tx = fineMap.get(fk);

        const endDate = h.returnDate ? String(h.returnDate).slice(0, 10) : today;
        const slab = calcFineSlabWithEnd(h.dueDate, endDate);

        const isPaid = tx && String(tx.status).toUpperCase() === "PAID";

        return {
          bookId: Number(h.bookId),
          issueDate: String(h.issueDate || "-").slice(0, 10),
          dueDate: String(h.dueDate || "-").slice(0, 10),
          returnDate: h.returnDate ? String(h.returnDate).slice(0, 10) : null,

          status: h.returnDate ? "RETURNED" : (String(h.dueDate || "") < today ? "OVERDUE" : "ISSUED"),

          overdueDays: slab.overdue ? slab.lateDays : 0,
          fineAmount: isPaid ? Number(tx.fineAmount || 0) : (slab.overdue ? slab.fine : 0),

          paid: !!isPaid,
          paidAt: isPaid && tx.paidAt ? String(tx.paidAt).slice(0, 10) : null
        };
      });

      res.send({
        rollNo: Number(student.rollNo),
        name: student.name || "-",
        course: student.course || "-",
        rows
      });
    } catch (e) {
      res.status(500).send("Failed to load student ledger ");
    } finally {
      client.close();
    }
  });
});



app.listen(2200);
console.log("Server Started on : http://127.0.0.1:2200");
